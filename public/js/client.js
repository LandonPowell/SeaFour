var socket = io(); 

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
        string=string.replace(/\(\*([^)]+)\)/gi, 
                              "<b>$1</b>")
                     .replace(/\(%([^)]+)\)/gi, 
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
                     .replace(/\(#((?:[\da-f]{3})+)([^)]+)\)/gi, 
                              "<span style=\"color:#$1\">$2</span>")
                     .replace(/\(:([a-z0-9]+)\)/gi,
                              "<span onclick=\"idJump('$1')\" class=\"postLink\">$1</span>")
                     .replace(/([a-z]*:\/+[a-z0-9\-]*.[^<>\s]+)/gi, /* URL links */
                              "<a class=\"link\" href=\"$1\">$1</a>")
                     .replace(/([a-z]*:\/*[a-z0-9\-]*.[^<>\s]*(?:\.jpg|\.png|\.svg|\.gif))/gi, /* Image links */
                              "<img class=\"inlineimage\" src=\"$1\"");
        return string;
    }
};

//Sockit Emitance Functions.
function send(msg) { /* Setting a function allows the end-user to modify it. */
    socket.emit('message', msg);
}
function login(nick, password) {
    socket.emit('login', nick, password);
}

//User Interface.
$(function(){ /* On load */
    $('#handle')
        .draggable({ containment: "#messages" })
        .resizable({
            minHeight: 51,
            minWidth: 177,
            handles: "se"
        });

    $("#submitButton").click(function(){
        login(
            $("#userName").val(),
            $("#passWord").val()
        );
        $("#userName").val("");
        $("#passWord").val("");
        
        $("#menu").slideToggle();
    });
});

function keyPressed(event) {
    if(event.keyCode == 13 && !event.shiftKey) { /* Enter is pressed. */
        var text = $("#inputbox").val();
        $("#inputbox").val("");
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
                    socket.emit('me', text.substring(4));
                    break;
                case ".nick":
                    socket.emit('changeNick', text.substring(6));
                    break;
                case ".register":
                    socket.emit('register', text.substring(10));
                    break;
                case ".who":
                    socket.emit('who', text.substring(5));
                    break;
                
                case ".flair":
                    socket.emit('flair', text.substring(7));
                    break;
                    
                case ".topic":
                    socket.emit('topic', text.substring(7));
                    break;
                case ".fistOfRemoval":
                    socket.emit('fistOfRemoval', text.substring(15));
                    break;
                case ".roleChange": 
                    socket.emit('roleChange', command[1], command[2]);
                    break;
                default:
                    socket.emit(command[0].substr(1), 
                        text.substring(command[0].length + 1));
            }
        }
    }
}

function idJump(postId) {
    window.location.hash = "";
    window.location.hash = "#" + postId;
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

socket.on('listRefresh', function(newList){
    $("#menuButton").html("Users - " + newList.length);
    $("#userList").html("");
    for (var i = 0; i < newList.length; i++) {
        $("#userList").append(parser.htmlEscape(newList[i]) + "<br>");
    }
});


function flairify(nick, flair) {
    var parsedNick = parser.htmlEscape(nick);
    
    if (flair) {
        var parsedFlair = parser.style(
                          parser.htmlEscape(
                            flair
                          ));

        if (parsedNick == parsedFlair.replace(/<[^>]+>/g, "")) {
            return parsedFlair; 
        }
        else {
            return parsedNick;
        }
    }
    else {
        return parsedNick;
    }
}

//Event handlers. 
socket.on('message', function(nick, post, id, flair){
    autoscroll("#messages", 
               "<div class=\"message\"> \
                   <span class=\"postId\" id=\""+id+"\">"+id+"</span>" +
                flairify(nick, flair) + ": " +
                parser.style(parser.quote(parser.htmlEscape( post ))) + 
               "</div>");

    $("#"+id).click(function(event) {
        $("#inputbox").val(
            $("#inputbox").val() + 
            "(:"+id+")" 
        );
    });
});

socket.on('me', function(post){
    autoscroll("#messages", 
               "<div class=\"me message\">"+parser.htmlEscape(post)+"</div>");
});

socket.on('system-message', function(post){
    $("#notifications").append(
       "<div class=\"system-message\">" + 
       "<div class=\"notificationIcon\"></div>"+
          parser.htmlEscape( post ) + 
       "</div>");

    if ($("#notifications .system-message").length > 5) {
        $("#notifications").html("");
    } 
    else {
        setTimeout(function(){
            $(".system-message:first").animate({height: 0, margin: 0, padding: 0}, 500);
        }, 3000);
        setTimeout(function(){
            $(".system-message:first").remove();
        }, 4000);
    }
});

socket.on('disconnect', function(){
    autoscroll("#notifications", 
                "<div class=\"system-message\">Your socket has been disconnected.</div>");
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
