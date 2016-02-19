var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var hash = require('./lib/hash');
var jsonfile = require('jsonfile');

//We don't really need this, but I'll leave it as a comment.
//String.prototype.contains = function(it) { return this.indexOf(it)+1; };

function toArray(object) {
    var newArray = [];
    for (var key in object) {
        newArray.push(object[key]);
    }
    return newArray;
}

function usableVar(variable) {
    return typeof( variable ) === "string" && variable !== "";
}

function nameSanitize(nick) {
    return nick.toLowerCase().replace(/[^a-z0-9]/gi, "-");
}

var users;
var clients = [];
var ipLog = [];
var topic = "Welcome to SeaFour.club";
var postCount = 0; 

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
     *  from their mouse. This would be way less prediction-prone than
     *  using a pseudorandom number generator. Kind of inspired by that
     *  one thing I can't remember right now that made you shake your
     *  mouse around when you installed it.
     *
     *  You're thinking of a bitcoin wallet program, I think.
     *  This shouldn't be hard to do. DON'T DO IT THOUGH. IT'S NOT
     *  SAFE. MORE THOUGHT NEEDS TO BE DONE.
    \*/
}



app.use(express.static(__dirname + '/public/'));

io.on('connection', function(socket){
    //Start Up.
    socket.emit('topic', topic);
    socket.emit('data-request');

    clients[socket.id] = Math.random().toString(16).substr(2,6);
    ipLog[clients[socket.id]] = socket.request.connection.remoteAddress;

    console.log("JOIN: " + socket.id);
    io.emit('system-message', clients[socket.id] + ' has joined.');
    io.emit('listRefresh', toArray(clients));

    //Core Listeners.
    socket.on('message', function(msg){
        if (usableVar(msg)) {
            postCount++;
            var flair;

            if (users[nameSanitize(clients[socket.id])] !== undefined )
                flair = users[nameSanitize(clients[socket.id])].flair;
            if (! usableVar(flair) )
                flair = 0;
            io.emit('message', clients[socket.id], msg.substr(0,6000), postCount.toString(36), flair);
        }
    });

    socket.on('me', function(msg){
        if (usableVar(msg)) {
            io.emit('me', clients[socket.id]+" "+msg.substr(0,2048));
        }
    });

    // Commands related to Registration and User Accounts.
    socket.on('changeNick', function(nick) {
        if ( usableVar(nick) && users[nameSanitize(nick)] === undefined ) {
            io.emit('system-message', clients[socket.id] +
                                      " is now known as " +
                                      nick);
            clients[socket.id] = nick;
            io.emit('listRefresh', toArray(clients));
            ipLog[nick] = socket.request.connection.remoteAddress;
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
        if (usableVar(nick) && usableVar(password) &&
            users[nameSanitize(nick)] !== undefined) {
            password = hash.sha512(password + users[nameSanitize(nick)].salt);
            if (users[nameSanitize(nick)].password == password) {
                io.emit('system-message', clients[socket.id] + " is now known as " + nick);
                clients[socket.id] = nick;
                socket.to(socket.id).emit('auth', true);
                io.emit('listRefresh', toArray(clients));
                ipLog[nick] = socket.request.connection.remoteAddress;
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
        if (users[nameSanitize(userName)] != undefined) {
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
            if (users[ nameSanitize(clients[socket.id]) ] != undefined && 
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
             nameSanitize(clients[socket.id]) !== undefined &&
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
        if ( users[nameSanitize(removedUser)] !== undefined &&
             users[nameSanitize(clients[socket.id])].role > users[nameSanitize(removedUser)].role ||
             users[nameSanitize(removedUser)] === undefined ) {

            var removedUserID = Object.keys(clients).find(key => clients[key] == removedUser); 
            if (removedUserID !== undefined) {
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
    
    //Listener for Disconnects.
    socket.on('disconnect', function(){
        io.emit('system-message', clients[socket.id] + ' has left.');
        console.log("LEAVE: " + socket.id);
        delete clients[socket.id];
        io.emit('listRefresh', toArray(clients));
    });

}); 

http.listen(process.env.PORT || 80, function(){
    console.log('listening on *:' + (process.env.PORT || 80));
});

