// Initializer.
var express = require('express');
var app     = express();
var http    = require('http');
var https   = require('https');
var webServer   = http.Server(app);
var imageMagick = require('imagemagick');

var serverData = {};

process.on('uncaughtException', function(err) { // I don't like killing the process when one of my libraries fucks up.
    console.log("UNCAUGHT EXCEPTION\n" + err);
});

// Cryptography intializers.
var crypto  = require('crypto');
var sjcl    = require('sjcl');
var ECDH    = require('elliptic').ec;
var ec      = new ECDH('curve25519');
serverData.keyPair = ec.genKeyPair();
serverData.tokens = {};

// User database initializers.
var mongodb = require('mongodb').MongoClient;

var collection; // Make 'collection' a global variable.
mongodb.connect("mongodb://localhost:27017/c4", function(err, db) { 
    // If mongo is acting up, this might not connect, meaning 'collection' is left undefined.
    if (err) throw "I wasn't able to connect to Mongo.";

    collection = db.collection('users');
    console.log("I've connected to Mongo.");
});

// WebSockets Settings
var webSocketServer = require('ws').Server;
var socketServer    = new webSocketServer({ server: webServer });

function delimit() {
    return Array.from(arguments).join("\u0004");
}

socketServer.broadcast = function() {
    var args = Array.from(arguments);
    socketServer.clients.forEach(function(client) {
        client.send(args.join("\u0004"));
    });
};

serverData.rooms = {
    'main' : {  // By default, we have a 'main' room.
        clients : [],   // Connected sockets.
        posts : 0,      // Posts made so far.
        topic : "Highly Explosive", // The current topic. 
        messages : [],  // Last few messages posted.
        logLimit : 10   // How many messages should the log store. Lower if you're 'noided.
    },
};

serverData.roomUsers = function(room) {
    var nameList = [];
    if (serverData.rooms[room] == undefined) return nameList;

    var clients = serverData.rooms[room].clients;
    for (var client in clients) {
        nameList.push( clients[client].nick );
    }

    return nameList;
};

socketServer.roomBroadcast = function(room) {
    var args = Array.from(arguments).slice(1);
    args.push(room);
    var clients = serverData.rooms[room].clients;
    var binaryData = args.join("\u0004");
    clients.forEach(function(client) {
        if (client.readyState == 1) client.send(binaryData);
    });
};

// Functions used to wrap long statements in a more readable form. 
function usableVar(variable) {  // Checks if a variable won't fuck something up.
    return typeof( variable ) === "string" && variable;
}

function nameSanitize(nick) {   // Changes unimportant chars to dashes. 
    return nick.toLowerCase()
               .replace(/[^a-z\d]+/gi, "-")
               .replace(/-?([\w]+(?:-[\w]+)*)-?/g, "$1");
}

function checkValidName(nick) { // Checks if a name contains no strange chars or is taken.
    if (
        ['www', 'main', 'server', 'http'] // Reserved and possibly malicious names.
        .indexOf(nameSanitize(nick)) + 1 
    ) return false; // It's an array so I can put more in it later without doing much. 'Maintainability.'

    return  nick.replace(/[^\u0020-\u007e]/gi, "") == nick &&
            nick.indexOf("\n") < 0 &&
            nick.length < 30 && nick.length > 2;
}

// Moderation and antispam related variables, functions, and calls. 

var moderatorSettings = {
    quiet   : false,    // Disallows unregistered from posting; they can watch.
    ipLog   : [],
    banList : [],       // List of banned IPs.
    superBanList : []   // List of IPs that aren't even allowed to see the chat. NSA goes here. :^)
};

/*\ 
 * Humans have been shit at timekeeping since we first looked at the sky and 
 * used our sun's position to find out how long we had until nightfall. Now,
 * I shall carry on that tradition by assuming 24 * 60 * 60 * 1000 is the length
 * of a day in milliseconds, and I'll completely ignore that leap seconds and 
 * DST are real things.
\*/

setTimeout(function() {
    setInterval(function() {
        moderatorSettings.banList = [];
        serverData.keyPair = ec.genKeyPair(); // Reset keypair every night.
    }, 86400000);
}, ( 24 - new Date().getHours() ));

var ipEmits = {};       // Stores the number of emits made by any IP. 
setInterval(function() { ipEmits = {}; }, 3000);    // Every 3 seconds, clear.
function addEmit(ipAddress, socket) {
    if (ipEmits[ipAddress]) ipEmits[ipAddress] += 1;
    else                    ipEmits[ipAddress]  = 1;

    if (ipEmits[ipAddress] > 6) {   // Limits normal emits. 
        moderatorSettings.banList.push(ipAddress);
        console.log(ipAddress + " has been banned.");
        socket.close();
    }

    if (ipEmits[ipAddress] > 10) {   // Limits spam emits. 
        moderatorSettings.superBanList.push(ipAddress);
        console.log(ipAddress + " has been super banned.");

        if ( socket.readyState == 1 ) {
            socket.close();
        }
    }
}

var commands = {
    // Simple messages.s
    'roomMessage' : {
        function(socket, message, roomName) {
            var room = serverData.rooms[roomName];
            // If the user isn't in that room, toss out his message.
            if (room.clients.indexOf(socket) < 0) {
                return false;
            }

            room.posts++;

            socketServer.roomBroadcast(roomName,
                'roomMessage',
                socket.nick,
                message.substr(0,6000),
                room.posts.toString(36),
                socket.flair
            );

            if (room.logLimit != 0) {
                room.messages.push({
                    nick: socket.nick,
                    message: message.substr(0,3000), // Lower because muh data usage.
                    number: serverData.rooms[roomName].posts.toString(36),
                    flair: socket.flair,
                });
            }

            if (room.messages.length > room.logLimit) {
                room.messages = room.messages.slice(room.messages.length - room.logLimit);
            }

        },
    },

    'giveRecent' : {
        function(socket, roomName) {
            var room = serverData.rooms[roomName];
            // If the user isn't in that room, don't give him anything.
            if (room.clients.indexOf(socket) < 0) {
                return false;
            }

            var recentMessages = room.messages;
            for (var x = 0; x < recentMessages.length; x++) {
                var currentMessage = recentMessages[x];
                socket.send(delimit(
                    'roomMessage',
                    currentMessage.nick,
                    currentMessage.message,
                    currentMessage.number,
                    currentMessage.flair,
                    roomName
                ));
            }
        }
    },

    'me' : {
        function(socket, message, roomName) {
            socketServer.roomBroadcast(roomName,
                'me', socket.nick+" "+message.substr(0,2048));
        }
    },

    'specialMessage' : {
        function(socket, type, message, roomName) {
            var approvedTypes = ["term", "carbonite", "badOS", "pol", "autism", "drumpf"]; // Default approved types.

            if ( approvedTypes.indexOf(type) + 1 ) {
                socketServer.roomBroadcast(roomName,
                    'specialMessage', type, socket.nick, message.substr(0,2048) );
            }
            else {
                socket.send(delimit( 'systemMessage', "I can't let you do that, Dave." ));
            }

        },
    },

    // Get an encrypted private key.
    'getEncryptedPrivateKey' : {
        function(socket, nick) {
            collection.findOne({'name' : nameSanitize(nick)},
            function(err, result) {
                if (err || !result) {
                    socket.send(delimit( 'systemMessage', "That user doesn't exist." ));
                    socket.send(delimit( 'encryptedPrivateKey', nameSanitize(nick), "" ));
                    return false;
                }

                socket.send(delimit( 'encryptedPrivateKey',
                    nameSanitize(nick),
                    result.encryptedPrivateKey
                ));
            });
        },
    },

    // Registering, logging in, and changing names.
    'register' : {
        function(socket, nick, publicKey, encryptedPrivateKey) {

            if ( !checkValidName(nick) ) {
                socket.send(delimit( 'systemMessage', "You're not able to use " + nick + "."));
                socket.send('badLogin');
                return false;
            }
            collection.findOne({'name' : nameSanitize(nick)},
            function(err, result) {
                if (err || result) { // If this is true, someone else already registered.
                    socket.send(delimit( 'systemMessage', "That's someone else."));
                    socket.send('badLogin');
                    return false;
                }

                collection.insert({
                    'name' : nameSanitize(nick),
                    'role' : 0,
                    'publicKey' : publicKey,
                    'encryptedPrivateKey' : encryptedPrivateKey,

                    'points' : 0,
                    'renown' : 0,
                    'achievements' : {},

                },
                function(err, result) {
                    if (err) { console.log(err); return false; }

                    socket.send(delimit( 'systemMessage', "You are now registered, " + nick + "."));
                    socket.send(delimit( 'nickRefresh', nick ));

                    socket.nick = nick;
                    socket.role = 0;

                    for (var x = 0; x < socket.rooms.length; x++) {
                        socketServer.roomBroadcast(socket.rooms[x],
                            'listRefresh', serverData.roomUsers(socket.rooms[x]).join("\u0004"));
                    }

                    moderatorSettings.ipLog[nameSanitize( socket.nick )] = socket._socket.remoteAddress;
                });
            });
        },
    },

    'createToken' : { // Token is created for later authentication.
        // In order to create a token
        function(socket, nick) {
            collection.findOne({'name' : nameSanitize(nick)},
            function(err, result) {
                if (err || !result) return false;

                var plainToken = crypto.randomBytes(666).toString('hex'); // Firstly, create a random string. The end user will need to determine this.

                var sharedKey = serverData.keyPair.derive( // Nextly, we find the sharedKey between the server and our user.
                    ec.keyFromPublic(result.publicKey, 'hex').pub
                ).toString(36);

                var cryptoToken = sjcl.encrypt(sharedKey, plainToken); // Cryptographically secured token. We give this to the end user, who then decrypts it.

                serverData.tokens[plainToken] = { // We use the plainToken as a key, so we'll be able to easily access it.
                    userName : nameSanitize(nick), // Username is stored for later confirmation.
                    role  : result.role,
                };

                setTimeout(function() { // Delete the token after 2 seconds for obvious reasons.
                    delete serverData.tokens[plainToken];
                }, 2000);

                socket.send(delimit('cryptoToken', cryptoToken)); // Send the user the encryptedToken so he can decrypt it and send it back.

                // Additional login settings should be defined here. 
                socket.flair = result.flair; // Give the user the flair they desire.
            });
        },
    },

    'authenticate' : { // Authenticate based upon a token.
        function(socket, nick, token, roomName) {
            if ( !serverData.tokens[token] ) {
                socket.send(delimit('systemMessage',
                    "You weren't able to authenticate as " + nameSanitize(nick) + "."
                ));
                return false;
            }

            var tokenObject = serverData.tokens[token];

            if ( tokenObject.userName == nameSanitize(nick) ) {
                socket.send(delimit( 'systemMessage', "You are now authenticated, " + nick + "."));
                socket.send(delimit( 'nickRefresh', nick ));

                socket.nick = nick;
                socket.role = tokenObject.role;

                socketServer.roomBroadcast(roomName, 
                    'listRefresh', serverData.roomUsers(roomName).join("\u0004"));

                moderatorSettings.ipLog[nameSanitize( socket.nick )] = socket._socket.remoteAddress;
            }
            else {
                socket.send(delimit('systemMessage',
                    "You weren't able to authenticate as " + nameSanitize(nick) + "."
                ));
                socket.send('badLogin');
            }
        },
    },

    // Room management.
    'join' : {
        function(socket, roomName) {
            function joinBroadcast(room) {
                serverData.rooms[room].clients.push(socket);
                socket.send(delimit( 'topic', serverData.rooms[room].topic ));

                socketServer.roomBroadcast(room,
                    'systemMessage', socket.nick + ' has joined.');

                socketServer.roomBroadcast(room,
                    'listRefresh', serverData.roomUsers(room).join("\u0004"));
            }

            if (serverData.rooms[roomName]) {
                socket.rooms.push(roomName);
                console.log(socket.rooms);
                joinBroadcast(roomName);
                return true;
            }

            collection.findOne({'name' : nameSanitize(roomName) },
            function(err, result) {
                if (err || !result) {
                    socket.send('badRoom');
                    return false;
                }

                if (!result.room) { // To-do: Make this update the DB.
                    result.room = {
                        topic : "Highly Explosive", // The current topic. 
                        posts : 0,      // Posts that have been made so far.
                        mods  : [roomName], // List of people with moderator permissions.
                        messages : [],
                        logLimit : 10
                    };
                }

                serverData.rooms[roomName] = result.room;
                serverData.rooms[roomName].clients = [];

                joinBroadcast(roomName);
            });

        }
    },

    // Whispering.
    'directMessage' : {
        function(socket, userTo, message) {
            var wasSent = false;

            socketServer.clients.forEach(function(client) {
                if ( client.nick == userTo ) {
                    client.send(delimit('directMessage', "from",
                                nameSanitize(socket.nick),
                                message.substr(0,1000)));
                    wasSent = true;
                }
            });

            if ( !wasSent ) {
                socket.send(delimit( 'systemMessage', "That user isn't online right now." ));
                return false;
            }

            socket.send(delimit( 'directMessage', "to",
                        nameSanitize(userTo),
                        message.substr(0,1000)) );

        }
    },

    // Check user details.
    'who' : {
        function(socket, userName) {
            userName = nameSanitize(userName);
            collection.findOne({'name' : nameSanitize(userName)},
            function(err, result) {
                if (err || !result) {
                    socket.send(delimit('systemMessage', 
                        userName + " isn't registered."
                    ));
                    return false;
                }
                socket.send(delimit('systemMessage', 
                    userName + " is role " + result.role + "."
                ));
            });
        }
    },

    'getPublicKey' : {
        function(socket, nick) {
            if (nick == "server") {
                socket.send(delimit( 'publicKey',
                    'server',
                    serverData.keyPair.getPublic('hex')
                ));
                return true;
            }

            collection.findOne({'name' : nameSanitize(nick)},
            function(err, result) {
                if (err || !result) {
                    socket.send(delimit( 'systemMessage', "That user doesn't exist." ));
                    socket.send(delimit( 'publicKey', nameSanitize(nick), "" ));
                    return false;
                }

                socket.send(delimit( 'publicKey',
                    nameSanitize(nick),
                    result.publicKey
                ));
            });
        },
    },

    // Registered exclusive commands.
    'flair' : {
        role : 0,
        function(socket, flair) {
            collection.updateOne({'name' : nameSanitize(socket.nick)},
                { $set : { 'flair' : flair  } }
            );
            socket.flair = flair;
            socket.send(delimit('systemMessage', "Your flair has been updated."));
        },
    },

    'bio' : {
        role : 0,
        function(socket, bio) {
            collection.updateOne({'name' : nameSanitize(socket.nick)},
                { $set : { 'bio' : bio  } }
            );
            socket.send(delimit('systemMessage', "Your bio has been updated."));
        },
    },

    'website' : {
        role : 0,
        function(socket, link) {
            collection.updateOne({'name' : nameSanitize(socket.nick)},
                { $set : { 'website' : link  } }
            );
            socket.send(delimit('systemMessage', "Your website has been updated."));
        },
    },

    // Room settings.
    'topic' : {
        role: 0, 
        function(socket, newTopic, roomName) {
            var mods = serverData.rooms[roomName].mods;

            if (mods && mods.indexOf(nameSanitize(socket.nick)) < 0 ) {
                socket.send(delimit('systemMessage', "You aren't an approved moderator here."));
                return false;
            }

            serverData.rooms[roomName].topic = newTopic.substr(0, 27);
            socketServer.roomBroadcast(roomName,
                'topic', newTopic.substr(0, 27));
        }
    },

    // Global moderator exclusive commands.
    'fistOfRemoval' : {
        role: 1,
        function(socket, removedUser, roomName) {
            removedUser = nameSanitize(removedUser);

            collection.findOne({'name' : removedUser},
            function(err, result) {
                if (err || !result || socket.role > result.role) {
                    var clients = serverData.rooms[roomName].clients;

                    for (var client in clients) {
                        if (nameSanitize(clients[client].nick) == removedUser) {
                            clients[client].close();
                            return true;
                        }
                    }

                    socket.send(delimit('systemMessage', "That user isn't in this room."));
                    return false;
                }
                socket.send(delimit('systemMessage', "That user seems to have a level too high for you to kick."));
            });
        },
    },

    'getIP' : {
        role: 2,
        function(socket, searchedUser) {
            socket.send(delimit('systemMessage', 
                moderatorSettings.ipLog[ nameSanitize(searchedUser) ] || "no-ip-available"
            ));
        },
    },

    'roleChange' : {
        role: 2,
        function(socket, changedUser, role) {

            changedUser = nameSanitize(changedUser);
            role = parseInt(role, 10);
            if (socket.role < role && false) {
                socket.send(delimit('systemMessage', "Your role is too low."));
                return false;
            }

            collection.findOne({
                'name' : changedUser,
                'role' : { $lt : socket.role },
            },
            function(err, result) {
                if (err || !result) {
                    socket.send(delimit('systemMessage', changedUser + " does not exist or is too highly ranked."));
                }
                else {
                    socket.send(delimit('systemMessage', changedUser + "'s role is now " + role + "."));
                }
            });

            collection.updateOne({
                'name' : changedUser,
                'role' : { $lt : socket.role },
            },
            {
                $set : { 'role' : role },
            });

        },
    },

    'ban' : {
        role: 2,
        function(socket, maliciousUser) {
            var userIP = moderatorSettings.ipLog[ nameSanitize(maliciousUser) ] || maliciousUser;
            moderatorSettings.banList.push( userIP );
            socket.send(delimit('systemMessage', userIP + " has been banned."));
        },
    },

    'superBan' : {
        role: 3,
        function(socket, maliciousUser) {
            var userIP = moderatorSettings.ipLog[ nameSanitize(maliciousUser) ] || maliciousUser;
            moderatorSettings.superBanList.push( userIP );
            socket.send(delimit( 'systemMessage', userIP + " has been super banned." ));
        },
	},

    'clearBans' : {
        role: 2,
        function(socket) {
            moderatorSettings.banList = [];
            socketServer.broadcast('systemMessage', "The ban list has been cleared.");
        },
    },

    'clearSuperBans' : {
        role: 2,
        function(socket) {
            moderatorSettings.superBanList = [];
            socketServer.broadcast('systemMessage', "The super ban list has been cleared.");
        },
    },

    'quiet' : {
        role: 2,
        function(socket) {
            moderatorSettings.quiet = !moderatorSettings.quiet;
            socketServer.broadcast('systemMessage', "Quiet mode set to " + moderatorSettings.quiet);
        },
	},

    'genocide' : {
        role: 3,
        function(socket) {
            socketServer.broadcast('systemMessage', "There is much talk, and I have " +
                                     "listened, through rock and metal " +
                                     "and time. Now I shall talk, and you " +
                                     "shall listen.");
    
            socketServer.clients.forEach(function(client) {
                client.close();
            });
        },
	},

    // WIP COMMANDS BELOW THIS LINE.

    'banRange' : {
        role: 3,
        function(socket, maliciousUser) {
            var userIP = moderatorSettings.ipLog[ nameSanitize(maliciousUser) ] || maliciousUser;
            moderatorSettings.banList.push( userIP.substr(0, 14) );
            socket.send(delimit( 'systemMessage', userIP + " has been banned." ));
        },
	},

    // Low-level only commands. Not to be sent upon user request.

    'ping' : { // This is basically the 'keepAlive' of SeaFour.
        function(socket) { 
            socket.send('pong');
        }
    }
};

// RTC server using Web Sockets. Wew lad, we're in the future now.
socketServer.on('connection', function(socket) {
    addEmit( socket._socket.remoteAddress, socket );
    socket.rooms = [];

    // Handles banned users. Basically the asshole bouncer of SeaFour.
    if ( ipEmits[socket._socket.remoteAddress] > 6 || 
         moderatorSettings.superBanList.indexOf(socket._socket.remoteAddress) + 1 ||
         collection === undefined ) { // If the collection is undefined, they've joined so quickly the server couldn't even startup.

        console.log("Spammer detected at " + socket._socket.remoteAddress);
        socket.close();

        return false;
    }

    // Handlng the more 'front end' aspect of joining.
    socket.nick = Math.random().toString(16).substr(2,6);
    socket.send(delimit( 'nickRefresh', socket.nick ));
    moderatorSettings.ipLog[nameSanitize( socket.nick )] = socket._socket.remoteAddress;

    socket.on('message', function(data) {
        addEmit( socket._socket.remoteAddress, socket );

        var parameters = data.split("\u0004");

        var command = commands[ parameters[0] ];

        if ( command == undefined ) { // If a dumbass sends a command that isn't real.
            socket.send(delimit( 'systemMessage', parameters[0] + ' is not a command.' ));
            return false;
        }

        if ( moderatorSettings.banList.indexOf( socket._socket.remoteAddress ) + 1 ) { // If the user is banned. 
            return false;
        }

        for (var x = 1; x <= 2; x++) {
            if ( !usableVar(parameters[x]) ) {
                parameters[x] = "I'm a stupid idiot.";   // Funniest solution of the century.
            }
        }

        if ( command.role != undefined && 
           ( socket.role == undefined || socket.role < command.role ) ) {

            if (command.role == 0) {
                socket.send(delimit( 'systemMessage', parameters[0] + ' requires you to be registered.' )); 
            }
            else {
                socket.send(delimit( 'systemMessage', parameters[0] + ' requires at least role ' + command.role + '.' ));
            }
            return false;

        }

        parameters[0] = socket;
        command.function.apply(this, parameters);
    });

    //Listener for Disconnects.
    socket.on('close', function() {
        for (var x = 0; x < socket.rooms.length; x++) {

            var roomName = socket.rooms[x];

            socketServer.roomBroadcast(roomName,
                'systemMessage', socket.nick + ' has left.');

            var index = serverData.rooms[roomName].clients.indexOf(socket);
            if (index + 1) serverData.rooms[roomName].clients.splice(index, 1);

            socketServer.roomBroadcast(roomName,
                'listRefresh', serverData.roomUsers(roomName).join("\u0004"));

        }
    });

});

// Webapp Settings
app.set('view engine', 'pug');

app.use("/=:room/", function(request, response, giveClient) {
    if (request.url != '/' && request.url != '/index.html') {
        giveClient(); // Gives client assets. 
        return true;
    }

    var room = nameSanitize(request.params.room);

    if (serverData.rooms[room]) {
        giveClient();
        return true;
    }

    collection.findOne({ 'name' : room },
    function(err, result) {
        if (err || !result) {
            response.render('errorPage', {
                error: "That room doesn't seem to be available."
            });

            return false;
        }

        giveClient(); // Gives client assets.
    });

}, express.static(__dirname + '/client/') );

// User account pages. 
app.get('/[\\w-]+', function(request, response) {
    var userName = nameSanitize( request.url.substr(1) );

    collection.findOne({ 'name' : nameSanitize(userName) },
    function(err, result) {
        if (err || !result) {
            response.render('errorPage', {
                error: "That user doesn't seem to exist."
            });
            return false;
        }

        // Heads up: Pug auto-sanitizes HTML for you, so you
        // don't have to worry too hard about it; however, stay frosty.

        response.render('userPage', {
            user:       userName,
            flair:      result.flair   || "This user has not set a flair yet.",
            role:       result.role    || "This user has not been given a role yet.",
            website:    result.website || "This user has not set a website yet.",
            bio:        result.bio     || "This user has not set a bio yet.",
            renown:     result.renown,
        });
    });

});

app.get('/api/[\\w]+', function(request, response) {
    var userName = request.url.substr(5);

    if (userName == "server") {
        return response.send(JSON.stringify({
            publicKey : serverData.keyPair.getPublic('hex')
        }, null, 4 ));
    }

    collection.findOne({'name' : nameSanitize(userName) },
    function(err, result) {
        if (err || !result) {
            response.send("{}");
            return false;
        }

        response.send(JSON.stringify(
            result, ["name", "publicKey", "encryptedPrivateKey", "_id"], 4
        ));
    });
});

var lastImage = { // Defined globally so multiple uses of the function below can modify it.
    url: "",
    data: "",
};
// Image link to 100x100 thumbnail.
app.get('/img/[^\\s#]+', function(request, response) {
    var imageSource = request.url.substr(5).replace(/^[^:]*/, "https"); // This cures autism. Some idiots ACTUALLY use http.

    if ( imageSource == lastImage.url ) { // Checks for consecutive requests to the same image.
        response.writeHead(200, {'Content-Type' : 'image/jpeg'});
        response.end(lastImage.data, 'binary');
        return true;
    }

    https.get(imageSource, function(imageResponse) {
        var body = '';
        imageResponse.setEncoding('binary');
        imageResponse.on('data', function(data) {
            body += data;
        });
        imageResponse.on('end', function() {
            imageMagick.crop({
                srcData : body,
                format  : 'jpg',
                width   : 100,
                height  : 100,
                progressive : true,
            }, function(err, imageData){
                if (err) {
                    console.log(err);
                    return false;
                }

                lastImage.url = imageSource;
                lastImage.data = imageData;

                response.writeHead(200, {'Content-Type' : 'image/jpeg'});
                response.end(imageData, 'binary');
            });
        });
    }).on('error', function(err) {
        console.log(err);
    });
});

app.get("/", function(request, response, giveClient) {
    // Warning: The following section is full of reasons why JavaScript is a broken language and ECMA is full of retards. 
    // I'll fill it with comments so you can understand why.

    var topRooms = [];

    // We duplicate the object so we can remove rooms every run.
    // If you just do var rooms = serverData.rooms, changing 'rooms' will change serverData. 
    // "Could you use a function's scope to solve that?" Nope. Modifying a function's argument's keys will modify the input.
    var rooms = Object.assign({}, serverData.rooms); 

    // {} == {} simply doesn't work in JS.
    // {} != {} doesn't either.
    // You simply can't compare objects in JS and get non-retarded results.
    function hasRooms(rooms) {
        for (var _ in rooms) return true;
        return false;
    }

    // This is just a selection algorithm that gets the 20 most important rooms.
    // It's obvious what this does.
    for (var x = 0; x < 20 && hasRooms(rooms); x++) {
        var maxRoom = {
            name: "Err: Sorting reaching non-max room.",
            posts: -1,
            users: -1
        };

        for (var roomName in rooms) {
            var room = rooms[roomName];
            if (room.clients.length > maxRoom.users) {
                maxRoom = {
                    name: roomName,
                    topic: room.topic,
                    posts: room.posts,
                    users: room.clients.length,
                };
            }
            else if (room.clients.length == maxRoom.users) {
                maxRoom = {
                    name: roomName,
                    topic: room.topic,
                    posts: room.posts,
                    users: room.clients.length,
                };
            }
        }

        topRooms.push(maxRoom);
        delete rooms[maxRoom.name];
    }

    response.render('landingPage', {
        rooms: topRooms,
    });
});

app.use("/", express.static(__dirname + '/client/'));

// These lines run the webserver.
var port = process.env.PORT || 80;
webServer.listen(port, console.log('Listening on port ' + port));