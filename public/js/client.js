var client = {};
client.attributes = {
    nick: "Anon",
};
var socket = io();
//Make textbox draggable
$(function(){
    $('#handle')
        .draggable({
            containment: "#messages"
        })
        .resizable({
            minHeight: 51,
            minWidth: 177,
            handles: "se"
        });
});
//Parser.
var parser = {
    htmlEscape : function(string) { /* THIS ESCAPES HTML SPECIAL CHARACTERS */
        return string.replace(/&/g,"&amp;")
                     .replace(/</g,"&lt;")
                     .replace(/>/g,"&gt;")
                     .replace(/'/g,"&apos;")
                     .replace(/\"/g,"&quot;")
                     .replace(/\\/g,"&bsol;")
                     .replace(/  /g," &nbsp;")
                     .replace(/\n/g,"<br>")
        ;
    },
    quote : function(string) { /* THIS CREATES THE QUOTES/GREENTEXT */
        return string.replace(/&gt;([^<]+)/gi,
                              "<span class=\"quote\">$1</span>");
    },
    style : function(string) { /* ALL STYLES ARE CONTAINED IN THIS BLOCK. */
        return string.replace(/\(\*([^)]+)\)/gi,
                              "<b>$1</b>")
                     .replace(/\(\%([^)]+)\)/gi,
                              "<i>$1</i>")
                     .replace(/\(meme([^)]+)\)/gi,
                              "<span class=\"quote\">$1</span>")
                     .replace(/\(\$([^)]+)\)/gi,
                              "<span class=\"spoiler\">$1</span>")
                     .replace(/\(@([^)]+)\)/gi,
                              "<span class=\"ghost\">$1</span>")
                     .replace(/\(\^([^)]+)\)/gi,
                              "<span class=\"big\">$1</span>")
                     .replace(/\(~([^)]+)\)/gi,
                              "<span class=\"rainbow\">$1</span>")
                     .replace(/\(#([\dabcdef]+)([^)]+)\)/gi,
                              "<span style=\"color:#$1\">$2</span>")
        ;
    }
};
//Command Functions.
function send(msg) {
    socket.emit('message', {nick: client.attributes.nick, message: msg});
}
function me(msg) {
    socket.emit('me', {
        nick: client.attributes.nick,
        message: msg
    });
}
function login(nick, password) {
    socket.emit('command', {
        command: 'login',
        nick: nick,
        password: password,
        oldNick: client.attributes.nick
    });
}
function nick(name) {
    socket.emit('command', {
        command: 'changeNick',
        oldNick: client.attributes.nick,
        newNick: name
    });
}
function topic(text) {
    socket.emit('command', {
        command: 'topic',
        topic: text
    });
}

//When user is typing.
function keyPressed(event) {
    if(event.keyCode == 13 && !event.shiftKey) { /* Enter is pressed. */
        var text = document.getElementById("inputbox").value;
        document.getElementById("inputbox").value = null;
        event.preventDefault();
        if(text[0] != ".") { /* Commands start with a period. */
            send(text);
        }
        else {
            var command = text.split(" ");
            switch(command[0]){
                case ".login":
                    login(command[1], command[2]);
                    break;
                case ".me":
                    me(text.substring(4));
                    break;
                case ".nick":
                    /* Change this to nick(text.substring(6); later. */
                    nick(text.substring(6));
                    break;
                case ".topic":
                    topic(text.substring(7));
            }
        }
    }
}

function autoscroll(height) {
    var maxScroll = $("#messages").prop('scrollHeight') -
                    $("#messages").prop('clientHeight');
    if ($("#messages").scrollTop() > height - 400) {
        $("#messages").animate({
            scrollTop: maxScroll
        }, 100);
    }
}
function containsNick(text) {
    return text.indexOf(client.attributes.nick) >= 0;
}

//Event handlers.
socket.on('message', function(nick, post){
    var height = $("#messages").prop('scrollHeight') -
                 $("#messages").prop('clientHeight');
    $("#messages").append("<div class=\"message\">" +
                          parser.htmlEscape(
                              nick
                          ) + ": " +
                          parser.style(
                          parser.quote(
                          parser.htmlEscape(
                              post
                          ))) +
                          "</div>"
                        );
    console.log(nick+": "+post);
    autoscroll(height);
});
socket.on('me', function(post){
    var height = $("#messages").prop('scrollHeight') -
                 $("#messages").prop('clientHeight');
    $("#messages").append("<div class=\"me message\">" +
                          parser.htmlEscape( post ) +
                          "</div>"
                        );
    console.log(post);
    autoscroll(height);
});
socket.on('system-message', function(post){
    var height = $("#messages").prop('scrollHeight') -
                 $("#messages").prop('clientHeight');
    $("#messages").append("<div class=\"system-message\">" +
                          parser.htmlEscape(
                              post
                          ) +
                          "</div>");
    console.log(post);
    autoscroll(height);
});
socket.on('disconnect', function(){
    var height = $("#messages").prop('scrollHeight') -
                 $("#messages").prop('clientHeight');
    $("#messages").append("<div class=\"system-message\">" +
                          "Your socket has been disconnected." +
                          "</div>");
    autoscroll(height);
});
socket.on('global', function(global){
    var height = $("#messages").prop('scrollHeight') -
                 $("#messages").prop('clientHeight');
    $("#messages").append("<h1 class=\"global\">" +
                          parser.htmlEscape(
                              global
                          )+
                          "</h1>");
    autoscroll(height);
});

socket.on('topic', function(title){
    var height = $("#messages").prop('scrollHeight') -
                 $("#messages").prop('clientHeight');
    $("#title").html(parser.htmlEscape(
                        title
                    ));
    document.title = title;
    autoscroll(height);
});

socket.on('userChange', function(){

});
