var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var hash = require('./lib/hash');
var jsonfile = require('jsonfile');
//Why isn't this default within Ecma? Fuck you, Ecma. 
String.prototype.contains = function(it) { return this.indexOf(it) != -1; };

var users;
var clients = [];
var topic = "Welcome to Ch4t.io";

jsonfile.readFile('database.json', function(err, obj) {
    users = obj;
    if (err != null)  console.log('Database Errors: '+err);
    else console.log('Database loaded.');
});

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
    //IP Address
    console.log(socket.handshake.address);
    console.log(socket.request.connection.remoteAddress);
    
    //Start Up.
    socket.emit('topic', "Topic - " + topic);
    socket.emit('data-request');

    clients[socket.id] = Math.random().toString(16).substr(2,6);

    console.log("JOIN: " + socket.id);
    io.emit('system-message', clients[socket.id] + ' has joined.');

    //Core Listeners.
    socket.on('message', function(msg){
        if (msg !== undefined && msg != '' && msg !== null) {
            io.emit('message', clients[socket.id], msg);
        }
    });
    
    socket.on('me', function(msg){
        if (msg !== undefined && msg != '' && msg !== null) {
            io.emit('me', clients[socket.id]+" "+msg);
        }
    });
    
    // Commands related to Registration and User Accounts.
    socket.on('changeNick', function(nick) {
        if (nick != undefined && users[nick.toLowerCase()] === undefined) {
            io.emit('system-message', clients[socket.id] + 
                                      " is now known as " + 
                                      nick);
            clients[socket.id] = nick;
        }
        else {
            socket.emit('system-message', "That user is already registered.");
        }
    });
    
    socket.on('register', function(password) {
        var salt = generateSalt();

        users[clients[socket.id].toLowerCase()] = {
            "password": hash.sha512(password + salt),
            "salt": salt,
            "flair": null,
            "prefix": null,
            "role" : 0 /* Default role is 0 */
        };
        
        jsonfile.writeFile('database.json', users, function(err) {
            if (err != null) socket.emit('system-message', 'ERROR: '+err);
            else socket.emit('system-message', "You are now registered");
        });
    });
    
    socket.on('login', function(nick, password) {
        if (nick != undefined && password != undefined && 
            users[nick.toLowerCase()] !== undefined) {
            password = hash.sha512(password + users[nick.toLowerCase()].salt);
            if (users[nick.toLowerCase()].password == password) {
                io.emit('system-message', clients[socket.id] + " is now known as " + nick);
                clients[socket.id] = nick;
                socket.to(socket.id).emit('auth', true);
            }
        }
        else {
            socket.emit('system-message', 
                        "That doesn't seem to be a registered combination. "+
                        "Please make sure you type '.login User Password'.");
        }
    });

    //Mod-Exclusive Listeners.
    function adminCommand(command, role, func) {
        socket.on(command, function(args){ 
            if (users[ clients[socket.id].toLowerCase() ] != undefined && 
                users[ clients[socket.id].toLowerCase() ].role >= role) {
                func(args); //This calms the Disco Pirates
            } 
            else {
                socket.emit('system-message', "Your role must be "+role+" or higher.");
            }
        });
    }

    adminCommand('topic', 1, function(newTopic){
        io.emit('topic', "Topic - " + newTopic);
        topic = newTopic;
    });
    
    adminCommand('fistOfRemoval', 1, function(removedUser){ /* Kick Command */ 
        if ( users[removedUser] !== undefined &&
             users[ clients[socket.id].toLowerCase() ].role > users[ removedUser.toLowerCase() ].role ||
             users[removedUser] === undefined ) {

            var removedUserID = Object.keys(clients).find(key => clients[key] == removedUser); 
            if (removedUserID !== undefined) {
                io.emit('system-message', removedUser + 
                                          " has been removed by " + 
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
    });

}); 

http.listen(process.env.PORT || 8080, function(){
    console.log('listening on *:' + (process.env.PORT || 8080));
});
