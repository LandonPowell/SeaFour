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
     *  You're thinking of a bitcoin wallet program, I think.
     *  This shouldn't be hard to do. DON'T DO IT THOUGH. IT'S NOT
     *  SAFE. MORE THOUGHT NEEDS TO BE DONE. 
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
    socket.emit('data-request');
    socket.attributes = {};
    
    clients[socket.id] = Math.random().toString(16).substr(2,6);
    
    console.log("JOIN: " + socket.id);
    io.emit('system-message', clients[socket.id] + ' has joined.');

    /* Listeners */
    socket.on('message', function(msg){
        if (msg.message !== undefined || msg.message != '' || msg.message !== null) {
            console.log(clients[socket.id]+": "+msg);
            io.emit('message', clients[socket.id], msg);
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
        io.emit('system-message', socket.attributes.nick + ' has left.');
        console.log("LEAVE: " + socket.id);
        delete clients[socket.id];
    });
    
    socket.on('changeNick', function(nick) {
        if (users[nick.toLowerCase()] === undefined) {
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
        
    });
    
    socket.on('login', function(nick, password) {
        if (users[nick.toLowerCase()] !== undefined) {
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

    socket.on('topic', function(newTopic){
        if (users[ clients[socket.id].toLowerCase() ] != undefined && 
            users[ clients[socket.id].toLowerCase() ].role > 0) {
            io.emit('topic', "Topic - " + newTopic);
            topic = newTopic;

        } 
        else {
            socket.emit('system-message', "Your role must be mod or higher.");
        }
    });
}); 

http.listen(process.env.PORT || 8080, function(){
    console.log('listening on *:' + (process.env.PORT || 8080));
});
