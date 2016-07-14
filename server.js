var express = require('express');
var app     = express();
var http    = require('http').Server(app);
var io      = require('socket.io')(http);
var pug     = require('pug');

var hash        = require('./lib/hash');
var jsonfile    = require('jsonfile');

app.use(express.static(__dirname + '/public/'));
app.set('view engine', 'pug');

function toArray(object) {
    var newArray = [];
    for (var key in object) {
        newArray.push(object[key]);
    }
    return newArray;
}

// Functions used to wrap long statements in a more readable form. 
function usableVar(variable) {  // Checks if a variable won't fuck something up.
    return typeof( variable ) === "string" && variable;
}
function nameSanitize(nick) {   // Changes unimportant chars to dashes. 
    return nick.toLowerCase()
               .replace(/[^\w]+/g, "-")
               .replace(/-?([\w]+(?:-[\w]+)*)-?/g, "$1");
}
function checkValidName(nick) { // Checks if a name contains no strange chars or is taken.
    return ! users[nameSanitize(nick)] && nick.replace(/[^\u0020-\u007e]/gi, "") == nick;
}

var clients = [];       // List of currently connected nicks by socketID.
var postCount = 0;      // Amount of posts made so far. Used for Post IDs.

// User Database
var users;

jsonfile.readFile('database.json', function(err, obj) {
    users = obj;
    if  (err)   console.log('Database Errors: ' + err);
    else        console.log('Database loaded. ');
});

function updateDatabase(socket, successMessage) {
    jsonfile.writeFile('database.json', users, function(err) {
        if  (err)   socket.emit('systemMessage', 'ERROR: ' + err);
        else        socket.emit('systemMessage', successMessage);
    });
}

function generateSalt() { /* ! THIS IS NOT CRYPTO-HEALTHY CODE ! */
    var salt = "";
    for (var i = 0; i < 64; i ++)
        salt += Math.random().toString(36).substr(2,1); /* ! PSEUDORANDOM ! */
    return salt;
    /*\
     *  Later idea for higher sec - Allow the users to seed using input
     *  from their mouse.  This would be way less prediction-prone than
     *  using a pseudorandom number generator. Kind of inspired by that
     *  one thing I can't remember right now, that makes you shake your
     *  mouse around when you fist install it in to get a random number.
     *  That'll probably lag a lot though, so I don't really have plans
     *  to implement it. 
    \*/
}

// Moderation and antispam related variables, functions, and calls. 
var ipLog   = {};       // Stores IP based on username. Isn't in the DB because muhfreedom.
var banList = [];       // List of banned IPs. 

var moderatorSettings = {
    quiet   : false, // Disallows unregistered from posting; they can watch.
    topic   : "Welcome to SeaFour.club" // The current topic. 
};

var ipEmits = {};       // Stores the number of emits made by any IP. 
setInterval(function() { ipEmits = {}; }, 3000);    // Every 3 seconds, clear.
function addEmit(ipAddress, socketID) {
    if (ipEmits[ipAddress]) ipEmits[ipAddress] += 1;
    else                    ipEmits[ipAddress]  = 1;

    if (ipEmits[ipAddress] > 2) {   // Limits posts to 2. 
        banList.push(ipAddress);
        console.log(ipAddress + " has been banned.");
        io.sockets.connected[ socketID ].disconnect();
    }
}

// Real Time Chat using Sockets
io.on('connection', function(socket) {
    // Start Up.
    socket.emit('topic', moderatorSettings.topic);
    clients[socket.id] = Math.random().toString(16).substr(2,6);
    socket.emit('nickRefresh', clients[socket.id]);

    // Handles banned users. Basically the asshole bouncer of SeaFour.
    if( ipLog[ nameSanitize(clients[socket.id]) ] &&
        banList.indexOf( ipLog[nameSanitize(clients[socket.id])] ) > 0 ) {
        io.sockets.connected[ socket.id ].disconnect();
    }
    else {
        ipLog[nameSanitize(clients[socket.id])] = socket.request.connection.remoteAddress;
        console.log("JOIN: " + socket.id);
        io.emit('systemMessage', clients[socket.id] + ' has joined.');
        io.emit('listRefresh', toArray(clients));
    }
    addEmit( ipLog[nameSanitize(clients[socket.id])], socket.id );

    // Core Listeners.
    socket.on('login', function(nick, password) { 

        /* LOTS OF SECURITY-SPAGHETTI AHEAD. */
        /* Simplicity leads to storing passwords in plaintext, I guess. */

        if ( usableVar(nick) && usableVar(password) && users[nameSanitize(nick)] &&
             users[nameSanitize(nick)].password == hash.sha512(password + users[nameSanitize(nick)].salt) ) {
            
            io.emit('systemMessage', clients[socket.id] + " is now known as " + nick);
            socket.emit('nickRefresh', nick);

            clients[socket.id] = nick;
            ipLog[nameSanitize(nick)] = socket.request.connection.remoteAddress;

            io.emit('listRefresh', toArray(clients));
        }
        else { 
            socket.emit('systemMessage', 
                        "That doesn't seem to be a registered combination. " +
                        "Please make sure you type '.login User Password'.");
        }
        addEmit( ipLog[nameSanitize(clients[socket.id])], socket.id );
    });
    
    function socketEmit(command, func) { // Disallows spammers.
        socket.on(command, function(arg1, arg2){ 
            if ((!moderatorSettings.quiet ||                    // These two bools check 
                 users[ nameSanitize(clients[socket.id]) ]) &&  // if the mute applies. 
                 banList.indexOf( ipLog[nameSanitize(clients[socket.id])] )<0 ) {  // This checks if the user is banned. 

                if (! usableVar(arg1)) arg1 = "I'm a stupid Idiot";   // This solution is a
                if (! usableVar(arg2)) arg2 = "I'm a stupid Idiot";   // thousand times funnier.

                func(arg1, arg2); // This calms the Disco Pirates
            }
            else {
                socket.emit('systemMessage', "Either only logged in users are " +
                                              "allowed to post, or you've been " +
                                              "disallowed from posting. " +
                                              "Maybe you'd just like to watch?");
            }
            addEmit( ipLog[nameSanitize(clients[socket.id])], socket.id );
        });
    }

    socketEmit('userMessage', function(msg) {
        postCount++;
        var flair;

        if ( users[nameSanitize(clients[socket.id])] )
            flair = users[nameSanitize(clients[socket.id])].flair;
        if (! usableVar(flair) )
            flair = false;

        io.emit('userMessage',  clients[socket.id], 
                                msg.substr(0,6000), 
                                postCount.toString(36), 
                                flair);
    });

    socketEmit('me', function(msg) {
        io.emit('me', clients[socket.id]+" "+msg.substr(0,2048));
    });

    socketEmit('specialMessage', function(type, msg) {
        var approvedTypes = ["term", "carbonite", "badOS"];
        if ( approvedTypes.indexOf(type) + 1 ) {
            io.emit('specialMessage', type, clients[socket.id], msg.substr(0,2048));
        }
        else {
            socket.emit('systemMessage', "I can't let you do that, Dave.");
        }
    });

    socketEmit('directMessage', function(userTo, message) {
        var toSocketID = Object.keys(clients).find(
            name => nameSanitize(clients[name]) == nameSanitize(userTo)
        );

        if ( toSocketID ) {
            io.sockets.connected[ toSocketID ].emit('directMessage', "from",
                                                     nameSanitize(clients[socket.id]),
                                                     message.substr(0,1000));
            socket.emit('directMessage', "to", 
                         nameSanitize(userTo), 
                         message.substr(0,1000));
        }
        else {
            socket.emit('systemMessage', "That user isn't online right now.");
        }
    });

    // Commands related to Registration and User Accounts.
    socketEmit('changeNick', function(nick) {
        if ( checkValidName(nick) ) {
            io.emit('systemMessage', clients[socket.id]+" is now known as "+nick);
            socket.emit('nickRefresh', nick);

            clients[socket.id] = nick;
            ipLog[nameSanitize(nick)] = socket.request.connection.remoteAddress;

            io.emit('listRefresh', toArray(clients));
        }
        else {
            socket.emit('systemMessage', "That user is already registered.");
        }
    });

    socketEmit('register', function(password) {
        var salt = generateSalt();
        if ( !clients[socket.id].match(/[\da-f]{6}/gi) ) {
            users[nameSanitize(clients[socket.id])] = {
                "password"  : hash.sha512(password + salt),
                "salt"      : salt,
                "flair"     : null,
                "bio"       : "This user has not set a bio yet.",
                "website"   : "This user has not set a website yet.",
                "corp"      : 0, /* Becomes an object upon incorporation */
                "role"      : 0, /* Default role is 0 */
                
            };
            updateDatabase(socket, "You are now registered.");
        }
        else {
            socket.emit('systemMessage', "That doesn't look right. Try again.");
        }

    });

    socketEmit('who', function(userName) {
        if ( users[nameSanitize(userName)] ) {
            var user = users[nameSanitize(userName)];
            var message = nameSanitize(userName) + 
                          " is role " + user.role + 
                          ", with flair " + user.flair;

            if (user.corp) message += ", and is incorporated.";
            else           message += ", and isn't incorporated.";

            socket.emit('systemMessage', message);
        }
        else {
            socket.emit('systemMessage', 
                nameSanitize(userName) + " is not registered."
            );
        }
    });

    //Function for commands that require registering or a specific role.
    function userCommand(command, role, func) {
        socketEmit(command, function(arg1, arg2){ 
            if (users[ nameSanitize(clients[socket.id]) ] && 
                users[ nameSanitize(clients[socket.id]) ].role >= role) {
                func(arg1, arg2); //This calms the Disco Pirates
            }
            else if (role) {
                socket.emit('systemMessage', "Your role must be "+role+" or higher.");
            }
            else {
                socket.emit('systemMessage', "You must be registered to do that.");
            }
        });
    }

    //Registered-Exclusive listeners.
    userCommand('flair', 0, function(newFlair) {
        users[nameSanitize(clients[socket.id])].flair = newFlair;
        updateDatabase(socket, "Your flair is now " + newFlair);
    });
    userCommand('bio', 0, function(newBio) {
        users[nameSanitize(clients[socket.id])].bio = newBio;
        updateDatabase(socket, "Your bio is now: " + newBio);
    });
    userCommand('website', 0, function(newWebsite) {
        users[nameSanitize(clients[socket.id])].website = newWebsite;
        updateDatabase(socket, "Your website is now " + newWebsite);
    });

    userCommand('topic', 0, function(newTopic) {
        moderatorSettings.topic = newTopic.substr(0, 27);
        io.emit('topic', newTopic.substr(0, 27));
    });

    //Mod-Exclusive Listeners.

    userCommand('fistOfRemoval', 1, function(removedUser) { /* Kick Command */ 
        if ( users[nameSanitize(removedUser)] &&
             users[nameSanitize(clients[socket.id])].role > users[nameSanitize(removedUser)].role ||
             ! users[nameSanitize(removedUser)] ) {

            var removedUserID = Object.keys(clients).find(name => clients[name] == removedUser); 

            if ( removedUserID ) {
                io.emit('systemMessage', removedUser + 
                                          " has been dismissed by " + 
                                          clients[socket.id]);
                io.sockets.connected[ removedUserID ].disconnect();
            } 

            else {
                socket.emit('systemMessage', "They don't seem to be online.");
            }

        }
        else {
            socket.emit('systemMessage', "That doesn't look quite right.");
        }
    });

    userCommand('getIP', 2, function(searchedUser) {
        var userIP = ipLog[ nameSanitize(searchedUser) ] || "no-ip-available";
        socket.emit('systemMessage', userIP);
    });

    userCommand('roleChange', 2, function(userName, role) {
        if ( usableVar(userName) && usableVar(role) && 
             users[nameSanitize(userName)] &&
             users[nameSanitize(clients[socket.id])].role > users[nameSanitize(userName)].role &&
             users[nameSanitize(clients[socket.id])].role > parseInt(role, 10) ) {

                users[nameSanitize(userName)].role = parseInt(role, 10);
                updateDatabase(socket, userName + " is now role: " + role);
        }
        else {
            socket.emit('systemMessage', "That doesn't seem quite right. " + 
                                         "Try .roleChange userName role ");
        }
    });

    userCommand('ban', 2, function(maliciousUser) {
        var userIP = ipLog[ nameSanitize(maliciousUser) ] || maliciousUser;
        banList.push( userIP );
        socket.emit('systemMessage', userIP + " has been banned.");
    });

    userCommand('clearBans', 2, function() {
        banList = [];
        io.emit('systemMessage', "The ban list has been cleared.");
    });

    userCommand('quiet', 2, function() {
        moderatorSettings.quiet = ! moderatorSettings.quiet;
        io.emit('systemMessage', "Quiet mode set to " + moderatorSettings.quiet);
    });

    userCommand('banRange', 3, function(maliciousUser) {
        var userIP = ipLog[ nameSanitize(maliciousUser) ] || maliciousUser;
        banList.push( userIP.substr(0, 14) );
        socket.emit('systemMessage', userIP + " has been banned.");
    });

    userCommand('genocide', 3, function(){
        io.emit('systemMessage', "There is much talk, and I have " +
                                 "listened, through rock and metal " +
                                 "and time. Now I shall talk, and you " +
                                 "shall listen.");

        for ( var endUser in clients ) {
            io.sockets.connected[ endUser ].disconnect();
        }
    });

    //Listener for Disconnects.
    socket.on('disconnect', function() {
        io.emit('systemMessage', clients[socket.id] + ' has left.');
        console.log("LEAVE: " + socket.id);
        delete clients[socket.id];
        io.emit('listRefresh', toArray(clients));
    });

});

// User account pages. 
app.get('/[\\w-]+', function (request, response) {
    var userName = nameSanitize( request.url.substr(1) );

    if ( users[userName] ) response.render('userPage', {

        user:   userName,

        flair:      users[userName].flair,
        role:       users[userName].role,
        website:    users[userName].website,
        bio:        users[userName].bio,

    });
    else response.send( "That user can't be found." );

});

// These lines run the webserver. 
var port = process.env.PORT || 80;
http.listen(port, console.log('Listening on port ' + port));