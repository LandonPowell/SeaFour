var client = {};
var socket = io();

//Parser.
var parser = {
    htmlEscape : function(string) { /* THIS ESCAPES HTML SPECIAL CHARACTERS */
        return string.replace(/&/g,"&amp;")
                     .replace(/</g,"&lt;")
                     .replace(/>/g,"&gt;")
                     .replace(/'/g,"&apos;")
                     .replace(/\"/g,"&quot;")
                     .replace(/\'/g,"&rsquo;")
                     .replace(/\\/g,"&bsol;")
                     .replace(/  /g," &nbsp;")
                     .replace(/\n/g,"<br>")
        ;
    },
    quote : function(string) { /* THIS CREATES THE QUOTES/GREENTEXT */ 
        return string.replace(/&gt;([^<]+)/gi, 
                              "<span class=\"quote\">$1</span>");
    },
    style : function(string) { /* THE MIGHTY LISP STYLE SYNTAX PARSER. */ 
        //Tokenizer.
        var tokens = string.replace(/\(LP\)/g,"&#40;") //Escape codes.
                           .replace(/\(RP\)/g,"&#41;")
                           .replace(/\(/g," ( ")
                           .replace(/\)/g," ) ").split(" ");

        //Nester.
        function nest(array) {
            var item = array.shift();
            if (item == '(') {
                var newList = [];
                while (array[0] != ')') newList.append(nest(array));
                array.shift();
                return newList;
            }
            else {
                return item;
            }
        }
        
        /* THE FOLLOWING IS PLACEHOLDER CODE BECAUSE I'M A LAZY SHAZBOT */
        string = string.replace(/\(\*([^)]+)\)/gi, 
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
                     .replace(/([a-z]*:\/+[a-z0-9\-]*.[^<>\s]+)/gi, /* URL links */
                              "<a class=\"link\" href=\"$1\">$1</a>")
                     .replace(/([a-z]*:\/*[a-z0-9\-]*.[^<>\s]*(?:\.jpg|\.png|\.svg|\.gif))/gi, /* Image links */
                              "<img class=\"inlineimage\" src=\"$1\"");
        return string;
    }
};

//Command Functions.
function send(msg) {
    socket.emit('message',msg);
}
function me(msg) {
    socket.emit('me', msg);
}
function login(nick, password) {
    socket.emit('login', nick, password);
}
function nick(name) {
    socket.emit('changeNick', name);
}
function register(name) {
    socket.emit('register', name);
}

//Admin Commands.
function topic(text) {
    socket.emit('topic', text);
}
function fistOfRemoval(nick) {
    socket.emit('fistOfRemoval', nick);
}

//User Interface.
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
                    nick(text.substring(6));
                    break;
                case ".register":
                    register(text.substring(10));
                    break;
                case ".topic":
                    topic(text.substring(7));
                    break;
                case ".fistOfRemoval":
                    fistOfRemoval(text.substring(15));
                    break;
                default:
                    send(text);
            }
        }
    }
}

function autoscroll(appendTo, appendstring) {
    var height = $("#messages").prop('scrollHeight') - 
                 $("#messages").prop('clientHeight');

    $(appendTo).append(appendstring);
    
    var maxScroll = $("#messages").prop('scrollHeight') -
                    $("#messages").prop('clientHeight');
    if ($("#messages").scrollTop() > height - 400) {
        $("#messages").animate({
            scrollTop: maxScroll
        }, 100);
    }
}

//Event handlers. 
socket.on('message', function(nick, post){
    autoscroll("#messages", 
               "<div class=\"message\">" +  parser.htmlEscape( nick ) + ": " +
                parser.style(parser.quote(parser.htmlEscape( post ))) + "</div>");
});

socket.on('me', function(post){
    autoscroll("#messages", 
               "<div class=\"me message\">"+parser.htmlEscape(post)+"</div>");
});

socket.on('system-message', function(post){
    autoscroll("#notifications",
               "<div class=\"system-message\">" + 
               "<div class=\"notificationIcon\"></div>"+
                parser.htmlEscape( post ) + 
               "</div>");
    if ($("#notifications .system-message").length > 5) {
        $("#notifications").html("");
    }
    setTimeout(function(){
        $(".system-message:first").animate({height: 0, margin: 0, padding: 0}, 500);
    }, 3000);
    setTimeout(function(){
        $(".system-message:first").remove();
    }, 4000);

});

socket.on('disconnect', function(){
    autoscroll("#notifications", 
                "<div class=\"system-message\">Your socket has been disconnected.</div>");
});

socket.on('listRefresh', function(newList){
    $("#menuButton").html("Users: " + newList.length);
    $("#userlist").html("");
    for (var i = 0; i < newList.length; i++) {
        $("#userlist").append(newList[i] + "<br>");
    }
});

socket.on('global', function(global){
    autoscroll("<h1 class=\"global\">" + 
                parser.htmlEscape( global )+ 
               "</h1>");
});

socket.on('topic', function(title){
    $("#title").html(parser.htmlEscape( title ));
    $("title").html(parser.htmlEscape( title ));
});
