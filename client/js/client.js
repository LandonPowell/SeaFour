/* global parser flairify nameSanitize $ location sjcl */

// This little bundle of code is just something I use to prevent people
// from just tossing a bunch of iframes on their site to get users banned.
if (window.frameElement) {
    var confirmation = confirm("This webpage is trying to embed 'SeaFour.club'. Is that okay with you?");
    if ( !confirmation ) window.frameElement.src = "http://zombo.com/";
}

console.log( // This is how we greet our friends.
    "%cWelcome to SeaFour. %c\n\n If you're a developer, check out our github " + 
    "- https://github.com/LandonPowell/ \n\n If someone told you to use this " +
    "feature and you don't know what you're doing, that means you could have " +
    "your security compromised and your passwords stolen. Tell someone! ",
    "font-size: 20px; font-family: serif; color: #666; padding-left: 100px;", 
    "font-size: 18px; font-family: serif; color: #666;");

// Setting up elliptical curve cryptography.
var ECDH = require('elliptic').ec;
var ec = new ECDH('curve25519');

// Picks which default CSS to use based on screen size.
if (window.outerWidth < window.outerHeight) { // If on a portrait screen (phone, tall, etc).
    var tallTheme = $("[name=tallTheme]")[0];
    tallTheme.disabled = false;
    tallTheme.rel = "stylesheet";
}

// These are the client-side attributes that need to be tracked for chat frontend usage. 
var attributes = {
    nick: "unnamed",
    points: 0,
    title: "",
    unread: 0,
    focus: true,
    hostparts: location.hostname.split("."),
    safe: false, // Safe mode filters out vulgar language and images, making SeaFour more public-friendly.
    badwords: [
        "fuck", "shit", "nigger", "faggot", "frick", "-_-", 
        "penis", "vagina", "cock", "cunt", "<img", "XD", ":P"], // Le trigger words. :^)
};

attributes.room = 
    location.pathname.substr(2, location.pathname.length-3) || attributes.hostparts[0],

attributes.domain =
    attributes.hostparts[attributes.hostparts.length - 2] + "." + // Domain name.
    attributes.hostparts[attributes.hostparts.length - 1];        // TLD.

// User Interface.
$(function() { // On load 

    // This pile of Jquery is for the draggable box. 
    // I use just about this exactly, with some minor mods, for the embeds too.
    $("#messages").on("mousemove", function(event) {
        if ($("#handlebar")[0].dragging) {
            $("#handle").offset({
                top:    event.pageY - 15,
                left:   event.pageX - $("#handle").width() / 2,
            });
        }
        if ($("#urlHandlebar")[0].dragging) {
            $("#embed").offset({
                top:    event.pageY - 15,
                left:   event.pageX - $("#embed").width() / 2,
            });
        }
    });

    $("#handlebar, #urlHandlebar").on("mousedown", function(event) {
        this.dragging = true;
    }).on("mouseup", function(event) {
        this.dragging = false;
    });

    $("#loginButton").click(function() {        // User Authentication System
        $("#loginMenu").hide(250);
        $("#popupNotification").show(250);

        setTimeout(function() {
            login(
                $("#userName").val(),
                $("#passWord").val()
            );

            $("#userName").val("");
            $("#passWord").val("");

            $("#popupNotification").hide(250);

        }, 251);

    });

    $("#registerButton").click(function() {     // User Registration System
        if ( $("#newPassphrase").val() != $("#confirmPhrase").val() ) { // If passphrase doesn't match the 'confirm'.
            $("#newPassphrase")[0].className = "incorrect";
            $("#confirmPhrase")[0].className = "incorrect";
            setTimeout(function() {
                $("#newPassphrase")[0].className = "";
                $("#confirmPhrase")[0].className = "";
            }, 500);
            return false;
        }

        $("#loginMenu").hide(250);
        $("#popupNotification").show(250);

        setTimeout(function() { // Slight delay to match animation.
            // Generate pbkdf2 Derived Symmetric Encryption Key. Same code for 'login'. 
            attributes.pbkdf2DerivedKey = sjcl.codec.base64.fromBits(
                sjcl.misc.pbkdf2(
                    $("#newPassphrase").val(), 
                    nameSanitize($("#newUserName").val()) + attributes.domain,
                    3500, 3000)
            );

            // Generate a random ECC key pair upon registration.
            attributes.keyPair = ec.genKeyPair();

            emit(['register', // Send the server all the details of registration
                $("#newUserName").val(),
                attributes.keyPair.getPublic('hex'),
                sjcl.encrypt(
                    attributes.pbkdf2DerivedKey,
                    attributes.keyPair.getPrivate('hex')
                )
            ]);

            // Reset everything.
            setTimeout(function(){
                $("#popupNotification").hide(250);
            }, 250);

            $("#newPassphrase").val("");
            $("#confirmPhrase").val("");

        }, 251);

    });

    $("#newUserName").keypress(function(event) {
        $("#newUserNameSanitized").html(
            nameSanitize( $("#newUserName").val() + event.key )
        );
    });

});

window.onfocus = function() {
    attributes.focus = true;
    attributes.unread = 0;
    $("title").html(parser.htmlEscape( attributes.title ));
};

window.onblur = function() {
    attributes.focus = false;
};

function embedURL(link) {
    $("#embed").show(250);

    if (link == "kill") $("#embed").hide(250);

    $("#embed iframe").attr('src', link);
}

// Simple Command Handlers.
function send(msg) { // Setting a function allows the end-user to modify it.
    if (msg) emit(['roomMessage', msg, attributes.room]);
}

function login(nick, password) {

    // Generate pbkdf2 Derived Symmetric Encryption Key
    attributes.pbkdf2DerivedKey = sjcl.codec.base64.fromBits(
        sjcl.misc.pbkdf2(
            password, 
            nameSanitize(nick) + attributes.domain,     // There is no client-side way to derive a consistent, yet random salt, so we use username + domain.
            3500, 3000)
    );

    emit(['getPublicKey', 'server']);
    listeners['publicKey'] = function(name, key) {
        if (name == 'server') {
            attributes.serverKey = ec.keyFromPublic(key, 'hex');
        }

        emit(['getEncryptedPrivateKey', nick]);
    };

    listeners['encryptedPrivateKey'] = function(name, encryptedPrivateKey) {
        try {
            var privateKey = sjcl.decrypt(
                attributes.pbkdf2DerivedKey,
                encryptedPrivateKey
            );
        }
        catch (err) {
            $("#loginMenu").show(250);
        }

        attributes.keyPair = ec.keyFromPrivate(privateKey, 'hex');

        emit(['createToken', nick]);
    };

    listeners['cryptoToken'] = function(cryptoToken) {
        var sharedKey = attributes.keyPair.derive(
            attributes.serverKey.getPublic()
        ).toString(36);

        var token = sjcl.decrypt(
            sharedKey,
            cryptoToken
        );

        emit(['authenticate', nick, token, attributes.room]);
    };
}

function keyPressed(event) {
    if(event.keyCode == 13 && !event.shiftKey) { // Enter is pressed.
        var text = $("#inputbox").val();
        var command = text.split(" ");
        $("#inputbox").val("");
        event.preventDefault();

        // Special messages start with a '.' and end with '!'.
        if (text[0] == "." && command[0][command[0].length - 1] == "!") {
            emit(['specialMessage', 
                command[0].substring(1, command[0].length - 1),
                text.substr(command[0].length + 1)]);
        }
        // Direct messages start with a '.' and end with a '.'. 
        else if (text[0] == "." && command[0][command[0].length - 1] == ".") {      // This is obviously very much the same as special messages.
            emit(['directMessage',                                            // I should consider refactoring this code later.
                command[0].substring(1, command[0].length - 1),             // It's not horrible, but I can do better and I should do better.
                text.substr(command[0].length + 1)]);
        }
        // Theme changes start with a '.' and end with a '-'. 
        else if (text[0] == "." && command[0][command[0].length - 1] == "-") {
            var style = command[0].substring(1, command[0].length - 1);
            var styles = ["none", "dark", "light", "stealth"];
            for (var i = 0; i < $("[name=theme]").length; i++) {
                if ( $("[name=theme]")[i].rel.indexOf("stylesheet") + 1 ) {
                    if ( styles.indexOf(style) + 1 && $("[name=theme]")[i].href.indexOf(style) + 1 ) {
                        $("[name=theme]")[i].disabled = false;
                        $("[name=theme]")[i].rel = "stylesheet";
                    } else {
                        $("[name=theme]")[i].disabled = true;
                    }
                }
            }
        }
        // Regular commands start with periods. 
        else if (text[0] == ".") {
            switch(command[0]){
                case ".login":
                    login(command[1], command[2]);
                    break;
                case ".nick":
                    emit(['changeNick', text.substr(6)]);
                    break;
                case ".safe":
                    attributes.safe = ! attributes.safe;
                    break;
                case ".embedURL":
                    embedURL(text.substr(10));
                    break;
                case ".roleChange": 
                    emit(['roleChange', command[1], command[2]]);
                    break;
                default:
                    emit([command[0].substr(1), text.substr(command[0].length + 1)]);
            }
        }
        // All other messages get sent. 
        else {
            send(text);
        }
    }
}


// Setting up websocket. I made some functions to make the syntax less obfuscated.
var listeners = {}
window.WebSocket = window.WebSocket || window.MozWebSocket;
var socket = new WebSocket("wss://" + location.host);

function emit(message) {
    socket.send( message.join("\u0004") );
}

// Automatic reconnect.
function connect() {
    socket = new WebSocket("wss://" + location.host);

    socket.emit = function() { // This joins socke.emit's args with a delimeter (\u0004) and socket.sends them.
        socket.send( [...arguments].join("\u0004") );
    };

    // Log errors to the console for debugging.
    socket.onerror = function(error) {
        console.log(error);
    };
    
    // Reconnect upon disconnect.
    socket.onclose = function() {
        append("#notifications", 
                    "<div class=\"systemMessage\">Your socket has been disconnected. Attempting to reconnect...</div>");

        $("#usersButton").html("Users - 0");
        $("#userList").html("");
        setTimeout(function() { connect(); }, 1000);
    };

    socket.onmessage = function(message) { // There has to be a more descriptive name than 'data' for this.
        var data = message.data.split("\u0004");
        if (! listeners[data[0]] ) { // Safety check, outputs a notice message to the console.
            console.log(
                "%cThe server has sent '" + data[0] + "', which is not defined as a listener.",
                "background-color: #DB9F9E; color: white;"
            );
            return false;
        }
        listeners[data[0]]( ...data.slice(1) );
    };
    
    socket.onopen = function(openingEvent) {
        emit(['join', attributes.room]);
        emit(['giveRecent', attributes.room]);
    };
}

connect();

// Points Management.
listeners['pointsUpdate'] = function(pointValue) {
    var lastRenown = 1,
        soFar = 0;

    if ( pointValue == Infinity ) soFar = 0;
    else if ( pointValue <= 12 ) soFar = pointValue;
    else {
        while ( pointValue > lastRenown * 12 ) lastRenown *= 12;
        soFar = pointValue - lastRenown;
    }

    $("#progressBar").css('width', 
        "calc( (100% - 40px) *" + (soFar / (lastRenown * 12 - lastRenown)) + ")"
    );

    $("#progressBar").fadeIn(200).fadeOut(1000);
};

// User List Management.
listeners['listRefresh'] = function() {
    $("#usersButton").html("Users - " + (arguments.length - 1));
    $("#userList").html("");
    // Note : Final argument is the room name, therefore we use 'length - 1'.
    for (var i = 0; i < arguments.length - 1; i++) {
        $("#userList").append(parser.htmlEscape(arguments[i]) + "<br>");
    }
};

listeners['nickRefresh'] = function(newNick) {
    attributes.nick = newNick;
};

function idJump(postId) {
    window.location.hash = postId;
}

function append(appendTo, appendstring) {                         // This function handles the appending
    var beforeHeight = $("#messages").prop('scrollHeight') -      // of messages to divs in a way that
                       $("#messages").prop('clientHeight');       // automatically autoscrolls.

    $(appendTo).append(appendstring);

    var afterHeight = $("#messages").prop('scrollHeight') -
                      $("#messages").prop('clientHeight');

    if ($("#messages").scrollTop() > beforeHeight - 400) {              // If the user is scrolled near the bottom,
        $("#messages").animate({ scrollTop: afterHeight + 300 }, 200);  // scroll him down.
    }

    // This changes the title of the window to show how many messages they haven't read.
    if (!attributes.focus) {
        attributes.unread += 1;
        $("title").html(parser.htmlEscape( attributes.unread + " : " + attributes.title ));
    }

    // This limits the amount of messages in history to 512, and removes them when they become too much.
    if ( $(".message").length > 512 ) $(".message:lt(128)").remove();

}

// Event handlers.
listeners['roomMessage'] = function(nick, post, id, flair) {
    var postType = "message";

    if (post.toLowerCase().indexOf( nameSanitize(attributes.nick) ) + 1) { // If post contains your nick. 
        postType += " alertMe";
        $("#notificationClick")[0].play();
    }

    var respondedTo = post.match(/{:\w+}/g) || [];
    for (var i = 0; i < respondedTo.length; i++) {

        var number = respondedTo[0].replace(/{:(\w+)}/, "$1");
        var referencedMessage = ($(".message:has(#"+number+") .userName")
                                    .html() || "")
                                    .replace(/<[^>]+>| /g, "");

        if ( referencedMessage.length && // If post contains your post number. 
             nameSanitize(referencedMessage).indexOf( nameSanitize(attributes.nick) ) + 1 ) {

            postType += " alertMe";
            $("#notificationClick")[0].play();

        }

    }

    post = parser.style(parser.quote(parser.htmlEscape( post )));

    if ( attributes.safe && new RegExp(attributes.badwords.join("|"), "i").test(post)) {
        postType += " vulgar";
    }

    append("#messages", 
               "<div class=\"" + postType + "\">                                \
                   <span class=\"postId\" id=\"" + id + "\">" + id + "</span>   \
                   <span class=\"userName\">"                                   +
                    flairify(nick, flair) + "</span> " + post + 
               "</div>");

    $("#"+id).click(function(event) {
        $("#inputbox").val(
            $("#inputbox").val() + "{:"+id+"} "
        );
    });
};

function directMessage(name) {
    $("#inputbox").val(
        "."+name+". " + $("#inputbox").val()
    );
}

listeners['directMessage'] = function(direction, from, message) {
    append("#messages", 
               "<div class=\"direct message\">"         +

                    "<span class=\"direction\"          \
                        onclick=\"directMessage('"      +
                        parser.htmlEscape(from)         +
                        "')\">"                         +

                        direction + ": "                +
                        parser.htmlEscape(from)         +
                    "</span> "                          +
                    parser.htmlEscape(message)          +
               "</div>");
    $("#notificationClick")[0].play();
};

listeners['me'] = function(post) {
    append("#messages", 
               "<div class=\"me message\">" +
                    parser.htmlEscape(post) +
               "</div>");
};

listeners['specialMessage'] = function(type, name, message) {
    append("#messages", 
               "<div class=\"message "+parser.htmlEscape(type)+"\">"+
                    "<span class=\"userName\">" + parser.htmlEscape(name) + 
                    "</span>: " + parser.htmlEscape(message) +
               "</div>");
};

listeners['systemMessage'] = function(post) {
    $("#notifications").append(
       "<div class=\"systemMessage\">           " + 
       "<div class=\"notificationIcon\"></div>  " +
          parser.htmlEscape( post ) + 
       "</div>");

    if ($("#notifications .systemMessage").length > 5) {
        $("#notifications").html("");
    } 
    else {

        setTimeout(function() {
            $(".systemMessage:first").animate({
                height: 0, 
                margin: 0, 
                padding: 0}, 
                100);
        }, 3000);

        setTimeout(function() {
            $(".systemMessage:first").remove();
        }, 3100);

    }
};

listeners['topic'] = function(newTitle) {
    $("#title").html(parser.htmlEscape( newTitle ));
    $("title").html(parser.htmlEscape( newTitle ));
    attributes.title = newTitle;
};

// Error and issue handling. 

listeners['badLogin'] = function() {
    $('#loginMenu').show(250); // Kind of To-do?
};


listeners['badRoom'] = function() {
    append("#notifications", 
                "<div class=\"systemMessage\">That room seems to be unavailable.</div>");
    emit(['join', "main"]);
};

listeners['ping'] = function() {
    emit(['pong']);
};

listeners['pong'] = function() {
    console.log("Connection is Alive");
};

setInterval(function() {
    emit(['ping']);
}, 13000);