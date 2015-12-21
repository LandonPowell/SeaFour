var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var hash = require('./lib/hash');
var jsonfile = require('jsonfile');
String.prototype.contains = function(it) { return this.indexOf(it) != -1; };

var users;
var clients = [];
var topic = "Welcome to Ch4t.io";

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
     *  Your thinking of a bitcoin wallet program, I think.
     *  This shouldn't be hard to do.
    \*/
}

jsonfile.readFile('database.json', function(err, obj) {
    users = obj;
    if (err != null) {
        console.log('Database Errors: '+err);
    } else {
        console.log('Database loaded.');
    }
});


app.use(express.static(__dirname + '/public/'));

io.on('connection', function(socket){
    /* Start Up */
    socket.emit('topic', "Topic - " + topic);
    updateID(socket, 'anon');
    socket.emit('data-request');
    socket.attributes = {};
    
    /* Listeners */
    socket.on('message', function(msg){
        if (msg.message !== undefined || msg.message != '' || msg.message !== null) {
            console.log(msg.nick+": "+msg.message);
            io.emit('message', msg.nick, msg.message);
        }
    });
    socket.on('me', function(msg){
        if (msg.message !== undefined || msg.message != '' || msg.message !== null) {
            console.log("-"+msg.nick+" "+msg.message);
            io.emit('me', msg.nick+" "+msg.message);
        }
    });
    
    socket.on('debug', function(msg){
        io.emit('system-message', socket);
    });
    
    socket.on('disconnect', function(){
        io.emit('system-message', socket.attributes.nick + ' has left.')
        console.log("LEAVE: " + socket.attributes.nick);
    });
    
    socket.on('command', function(object) {
        if (object === undefined) {
            console.log('Object is: ' + object);
            return false;
        }
        
        //Start handling shit
        if (object.command !== undefined) {
            if (object.command == 'login') {
                var nick = object.nick;
                if (users[nick] !== undefined && users[nick].password !== undefined) {
                    var password = hash.sha512(object.password + users[nick].salt);
                    if (users[nick].password == password) {
                        io.emit('system-message', 
                                object.oldNick + " is now known as " + nick);
                                    
                        socket.to(socket.id).emit('auth', true);
                    }
                }
                else {
                    socket.emit('system-message', 
                                "That doesn't seem to be a registered user. " +
                                "Please make sure you type '.login User Password'.");
                }
            }
            if (object.command == 'topic') {
                io.emit('topic', "Topic - " + object.topic);
                topic = object.topic;
            }
        }
    });
});



function updateID(id, name) {
    clients.push({name:id, id:name});
}

http.listen(process.env.PORT, function(){
    console.log('listening on *:'+process.env.PORT);
});