var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var hash = require('./lib/hash');
var jsonfile = require('jsonfile');

function toArray(object) {
    var newArray = [];
    for (var key in object) {
        newArray.push(object[key]);
    }
    return newArray;
}

// Functions used to wrap long statements in a more readable form. 
function usableVar(variable) {  // Checks if a variable won't crash the server.
    return typeof( variable ) === "string" && variable.trim() !== "";
}
function nameSanitize(nick) {   // Changes unimportant chars to dashes. 
    return nick.toLowerCase().replace(/[^\w]/gi, "-");
}
function checkValidName(nick) { // Checks if a name contains no strange chars or is taken.
    return ! users[nameSanitize(nick)] && nick.replace(/[^\u0020-\u007e]/gi, "") == nick;
}

var clients = [];       // List of currently connected nicks by socketID.
var postCount = 0;      // Amount of posts made so far. Used for Post IDs.
var topic = "Welcome to SeaFour.club";  // The current topic. 

// User Database
var users;

jsonfile.readFile('database.json', function(err, obj) {
    users = obj;
    if (err != null)  console.log('Database Errors: '+err);
    else console.log('Database loaded.');
});

function updateDatabase(socket, successMessage) {
    jsonfile.writeFile('database.json', users, function(err) {
        if (err) socket.emit('system-message', 'ERROR: '+err);
        else socket.emit('system-message', successMessage);
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
var ipLog = {};         // Stores IP based on username. Isn't in the DB because muhfreedom.
var banList = [];       // List of banned IPs. 

var ipEmits = {};       // Stores the number of emits made by any IP. 
setInterval(function(){ ipEmits = {}; }, 3000);    // Every 3 seconds, clear.
function addEmit(ipAddress, socketID) {

    if ( ipEmits[ipAddress] ) ipEmits[ipAddress] += 1;
    else ipEmits[ipAddress] = 0;

    if (ipEmits[ipAddress] > 2) {               // Limits posts to 2. 
        banList.push(ipAddress.substr(0,17));   // Bans the first 17 chars 'cuz muhfreedom. 
        console.log(ipAddress + " has been banned.");
        io.sockets.connected[ socketID ].disconnect();
    }
}

var moderatorSettings = {
    "muteUnnamed": false,
    "muteUnregistered": false,
};
function isMuted(nick) {
    return ( moderatorSettings.muteUnnamed && nick.match(/[\da-f]{6}/g) ) ||
           ( moderatorSettings.muteUnregistered && !users[nameSanitize(nick)] );
}

app.use(express.static(__dirname + '/public/'));

io.on('connection', function(socket){
    //Start Up.
    socket.emit('topic', topic);
    clients[socket.id] = Math.random().toString(16).substr(2,6);

    if( ipLog[ nameSanitize(clients[socket.id]) ] &&
        banList.indexOf( ipLog[nameSanitize(clients[socket.id])].substr(0,17) ) > 0 ) {
        io.sockets.connected[ socket.id ].disconnect();
    }
    else {
        ipLog[nameSanitize(clients[socket.id])] = socket.request.connection.remoteAddress;
        console.log("JOIN: " + socket.id);
        io.emit('system-message', clients[socket.id] + ' has joined.');
        io.emit('listRefresh', toArray(clients));
    }

    //Core Listeners.
    socket.on('message', function(msg){
        if (    usableVar(msg) && 
                banList.indexOf( socket.request.connection.remoteAddress.substr(0,17) )<0 &&
                !isMuted(clients[socket.id]) ) {

            postCount++;
            var flair;

            if (users[nameSanitize(clients[socket.id])] )
                flair = users[nameSanitize(clients[socket.id])].flair;
            if (! usableVar(flair) )
                flair = 0;
            io.emit('message', clients[socket.id], msg.substr(0,6000), postCount.toString(36), flair);
        }

        addEmit( ipLog[nameSanitize(clients[socket.id])], socket.id );
    });

    socket.on('me', function(msg){
        if (usableVar(msg)) {
            io.emit('me', clients[socket.id]+" "+msg.substr(0,2048));
        }

        addEmit( ipLog[nameSanitize(clients[socket.id])], socket.id );
    });

    // Commands related to Registration and User Accounts.
    socket.on('changeNick', function(nick) {
        if ( usableVar(nick) && checkValidName(nick) ) {
            io.emit('system-message', clients[socket.id]+" is now known as "+nick);
            io.emit('listRefresh', toArray(clients));
            socket.emit('nickRefresh', nick);

            clients[socket.id] = nick;
            ipLog[nameSanitize(nick)] = socket.request.connection.remoteAddress.substr((0, 17));

        }
        else {
            socket.emit('system-message', "That user is already registered.");
        }
    });

    socket.on('register', function(password) {
        var salt = generateSalt();

        if ( usableVar(password) && !clients[socket.id].match(/[\da-f]{6}/gi) ) {
            users[nameSanitize(clients[socket.id])] = {
                "password": hash.sha512(password + salt),
                "salt": salt,
                "flair": null,
                "prefix": null,
                "corp": 0, /* Becomes an object upon incorporation */
                "role" : 0 /* Default role is 0 */
            };
            updateDatabase(socket, "You are now registered.");
        }
        else {
            socket.emit('system-message', "That doesn't look right. Try again.");
        }

    });

    socket.on('login', function(nick, password) {
        if (usableVar(nick) && usableVar(password) && users[nameSanitize(nick)] ) {
            password = hash.sha512(password + users[nameSanitize(nick)].salt);
            if (users[nameSanitize(nick)].password == password) {
                io.emit('system-message', clients[socket.id] + " is now known as " + nick);
                io.emit('listRefresh', toArray(clients));
                socket.emit('nickRefresh', nick);

                clients[socket.id] = nick;
                ipLog[nameSanitize(nick)] = socket.request.connection.remoteAddress;

            }
            else {
                socket.emit('system-message', 
                            "That doesn't seem to be a registered combination. "+
                            "Please make sure you type '.login User Password'.");
            }
        }
        else {
            socket.emit('system-message', 
                        "That doesn't seem to be a registered combination. "+
                        "Please make sure you type '.login User Password'.");
        }
    });
    
    socket.on('who', function(userName) {
        if ( users[nameSanitize(userName)] ) {
            var user = users[nameSanitize(userName)];
            var message = nameSanitize(userName) + 
                          " is role " + user.role + 
                          ", with flair " + user.flair;

            if (user.corp) message += ", and is incorporated.";
            else           message += ", and isn't incorporated.";

            socket.emit('system-message', message);
        }
        else {
            socket.emit('system-message', 
                nameSanitize(userName) + " is not registered."
            );
        }
    });

    //Function for commands that require registering. 
    function userCommand(command, role, func) {
        socket.on(command, function(arg1, arg2){ 
            if (users[ nameSanitize(clients[socket.id]) ] && 
                users[ nameSanitize(clients[socket.id]) ].role >= role) {
                func(arg1, arg2); //This calms the Disco Pirates
            }
            else {
                socket.emit('system-message', "Your role must be "+role+" or higher.");
            }
        });
    }

    //Registered-Exclusive listeners.
    userCommand('flair', 0, function(newFlair) {
        users[nameSanitize(clients[socket.id])].flair = newFlair;
        updateDatabase(socket, "Your flair is now " + newFlair);
    });

    //Mod-Exclusive Listeners.
    userCommand('roleChange', 2, function(userName, role) {
        if ( usableVar(userName) && usableVar(role) && 
             nameSanitize(clients[socket.id]) &&
             nameSanitize(clients[socket.id]).role > nameSanitize(clients[socket.id]).role &&
             nameSanitize(clients[socket.id]).role > parseInt(role, 10) ) {

                users[nameSanitize(userName)].role = parseInt(role, 10);
                updateDatabase(socket, userName + " is now role: " + role);
        }
        else {
            socket.emit('system-message', "That doesn't seem quite right. Try .roleChange userName role");
        }
    });

    userCommand('topic', 1, function(newTopic) {
        io.emit('topic', newTopic);
        topic = newTopic;
    });

    userCommand('fistOfRemoval', 1, function(removedUser) { /* Kick Command */ 
        if ( users[nameSanitize(removedUser)] &&
             users[nameSanitize(clients[socket.id])].role > users[nameSanitize(removedUser)].role ||
             ! users[nameSanitize(removedUser)] ) {

            var removedUserID = Object.keys(clients).find(key => clients[key] == removedUser); 
            if ( removedUserID ) {
                io.emit('system-message', removedUser + 
                                          " has been dismissed by " + 
                                          clients[socket.id]);
                io.sockets.connected[ removedUserID ].disconnect();
            } 
            else {
                socket.emit('system-message', "They don't seem to be online.");
            }

        }
        else {
            socket.emit('system-message', "That doesn't look quite right.");
        }
    });
    
    userCommand('getIP', 2, function(searchedUser) {
        var userIP = ipLog[ nameSanitize(searchedUser) ] || "no-ip-available";
        socket.emit('system-message', userIP);
    });

    userCommand('ban', 2, function(maliciousUser) {
        var userIP = ipLog[ nameSanitize(maliciousUser) ] || "no-ip-available";
        banList.push( userIP.substr(0,17) );
        socket.emit('system-message', userIP + " has been banned.");
    });

    userCommand('mute', 2, function(userCategory) {
        if      ( userCategory == "nonicks" ) {
            moderatorSettings.muteUnnamed = true;
        }
        else if ( userCategory == "unregistered" ) {
            moderatorSettings.muteUnregistered = true;
        }
        else if ( userCategory == "nobody" ) {
            moderatorSettings.muteUnnamed = false;
            moderatorSettings.muteUnregistered = false;
        }
        io.emit('system-message', "A website admin has muted messages from " + userCategory);
    });

    //Listener for Disconnects.
    socket.on('disconnect', function(){
        io.emit('system-message', clients[socket.id] + ' has left.');
        console.log("LEAVE: " + socket.id);
        delete clients[socket.id];
        io.emit('listRefresh', toArray(clients));
    });

}); 

http.listen(process.env.PORT || 80, function(){
    console.log('Listening on port ' + (process.env.PORT || 80));
});