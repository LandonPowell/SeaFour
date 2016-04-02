var socket = io(); 
var attributes = {
    nick: "unnamed",
    title: "",
    unread: 0,
    focus: true,
};
//Parser.
var parser = {
    htmlEscape : function(string) { /* THIS ESCAPES HTML SPECIAL CHARACTERS */
        return string.replace(/&/g,  "&amp;"    )
                     .replace(/</g,  "&lt;"     )
                     .replace(/>/g,  "&gt;"     )
                     .replace(/'/g,  "&apos;"   )
                     .replace(/`/g,  "&#96;"    )
                     .replace(/\"/g, "&quot;"   )
                     .replace(/\\/g, "&bsol;"   )
                     .replace(/  /g, " &nbsp;"  )
                     .replace(/\n/g, "<br>"     );
    },
    quote : function(string) { /* THIS CREATES THE QUOTES/GREENTEXT */
        return string.replace(/&gt;([^<]+)/gi,
                              "<span class=\"quote\">$1</span>");
    },
    style : function(string) { /* THE MIGHTY LISP STYLE SYNTAX PARSER. */ 
    /* Can you believe that all this was once done with a metric fuckton of regex replaces? */
        //Operators
        var operators = {
            basic: {
                "*" : "bold"    ,
                "%" : "italic"  ,
                "$" : "spoiler" ,
                "^" : "big"     ,
                "~" : "rainbow" ,
                "meme" : "quote",
            },
            complex: {
                "#" : "color"   ,
                "@" : "ghost"   ,
                ":" : "postLink",
            },
        };
        //Regexes for checking validity of operator args.
        var regexChecks = {
            'color'     : /([a-f\d]{3}){1,2}/gi,
            'ghost'     : /([a-f\d]{3}){1,2}/gi,
            'postLink'  : /\w/gi,
        }
        
        //Tokenizer.
        function tokenize(s){ /* This is a massive bitch in javascript. */
            s = '(' + s + ')';
            var tokens = s.replace(/\(LP\)/g,"&#40;") /* Escape codes. */
                          .replace(/\(RP\)/g,"&#41;")
                          .replace(/\(/g," ( ")
                          .replace(/\)/g," ) ").split(" ");
            tokens.splice(0,1);
            return tokens;
        }

        //S-Expression Nester.
        function nest(array) { /* This is rather easy in JS. */
            var item = array.shift();
            if (item == '(') {
                var newList = [];
                while (array[0] != ')' && array.length) {
                    newList.push(nest(array));
                }
                array.shift();
                return newList;
            }
            else {
                return item;
            }
        }

        //S-Expression Evaluator.
        function evaluate(tree){ 
            var operator = tree.shift();
            var parsed;

            //Handles the simple operators, like (^ big text )
            if (operator in operators.basic) {
                parsed = "<span class=\""+ operators.basic[operator] +"\">";
            }
            //Handles the complex operators, like (#fff colors )
            else if (operator[0] in operators.complex) { 
                parsed = "<span class=\""+ operators.complex[operator[0]] +"\" ";

                var operation = operators.complex[operator[0]];
                var argument  = operator.substr(1);

                if ( regexChecks[operation].test(argument) ) {
                    switch (operation) {
                        case "color":
                            parsed += "style=\" color: #" + argument + "\">";
                            break;
                        case "ghost":
                            parsed += "style=\" text-shadow: 0px 0px 2px #" + argument + "\">";
                            break;
                        case "postLink":
                            parsed += "onclick=\"idJump('" + argument + "')\">" + argument;
                            break;
                    }
                }
                else { 
                    parsed += ">";
                }
            }
            //Handles empty expressions, such as ( this )
            else {
                parsed = "<span class='invalid'>"+operator+" "; 
            }

            for (var i = 0; i < tree.length; i++) {
                if (typeof tree[i] == "object")      parsed+=evaluate(tree[i]);
                else if (typeof tree[i] == "string") parsed+=" "+tree[i]+" ";
            }

            return parsed + "</span>";
        }

        //This returns the result of a parsing. 
        return evaluate( nest( tokenize( string ) ) );
    }
};

//User Interface.
/* global $ from Jquery library */
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

window.onfocus = function() {
    attributes.focus = true;
    attributes.unread = 0;
    $("title").html(parser.htmlEscape( attributes.title ));
};
window.onblur = function() {
    attributes.focus = false;
};

function embedURL(link) {
    $("#embed").remove();

    $("#messages").append("<div id=\"embed\">                               " +
                              "<div id=\"urlHandlebar\"> Embeded URL </div> " +
                              "<iframe src=\"" + link + "\"></iframe>       " +
                          "</div>");

    $("#embed")
        .draggable({ containment: "#messages" })
        .resizable({
            minHeight: 51,
            minWidth: 177,
            handles: "se"
        });

    if (link == "kill") $("#embed").remove();
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
    
    if (!attributes.focus) { 
        attributes.unread += 1;
        $("title").html(parser.htmlEscape( attributes.unread + " : " + attributes.title ));
    }
}

// Command Handling.
function send(msg) { /* Setting a function allows the end-user to modify it. */
    socket.emit('message', msg);
}
function login(nick, password) {
    socket.emit('login', nick, password);
}

function keyPressed(event) {
    if(event.keyCode == 13 && !event.shiftKey) { /* Enter is pressed. */
        var text = $("#inputbox").val();
        $("#inputbox").val("");
        event.preventDefault();

        if(text[0] == ".") { /* Commands start with a period. */
            var command = text.split(" ");

            switch(command[0]){
                case ".login":
                    login(command[1], command[2]);
                    break;
                case ".nick":
                    socket.emit('changeNick', text.substring(6));
                    break;
                case ".embedURL":
                    embedURL(text.substring(10));
                    break;
                case ".roleChange": 
                    socket.emit('roleChange', command[1], command[2]);
                    break;
                default:
                    socket.emit(command[0].substr(1),
                                text.substring(command[0].length + 1));
            }
        }
        else { /* Send a non-command message. */
            send(text);
        }
    }
}

//User List Management
socket.on('listRefresh', function(newList){
    $("#menuButton").html("Users - " + newList.length);
    $("#userList").html("");
    for (var i = 0; i < newList.length; i++) {
        $("#userList").append(parser.htmlEscape(newList[i]) + "<br>");
    }
});

socket.on('nickRefresh', function(newNick){
    attributes.nick = newNick;
});

function flairify(nick, flair) {
    var parsedNick = parser.htmlEscape(nick);
    
    if (flair) {
        var parsedFlair = parser.style(
                          parser.htmlEscape(
                            flair
                          ));

        if (parsedNick == parsedFlair.replace(/<[^>]+>/g, "")) return parsedFlair; 
        else return parsedNick;
    }
    else {
        return parsedNick;
    }
}

//Event handlers. 
socket.on('message', function(nick, post, id, flair){
    var postType = "message";

    if (post.indexOf(attributes.nick) + 1) { /* If post contains nick. */
        postType += " alertMe";
        $("#audio").html(
            "<embed src=\"js/alertNoise.ogg\"   \
            style=\"display:none\"              \
            autostart=true loop=false>         ");
    }

    autoscroll("#messages", 
               "<div class=\""+postType+"\"> \
                   <span class=\"postId\" id=\""+id+"\">"+id+"</span>" +
                flairify(nick, flair) + ": " +
                parser.style(parser.quote(parser.htmlEscape( post ))) + 
               "</div>");

    $("#"+id).click(function(event) {
        $("#inputbox").val(
            $("#inputbox").val() +  "(:"+id+")"
        );
    });
});

socket.on('me', function(post){
    autoscroll("#messages", 
               "<div class=\"me message\">"+
                    parser.htmlEscape(post)+
               "</div>");
});

socket.on('system-message', function(post){
    $("#notifications").append(
       "<div class=\"system-message\">          " + 
       "<div class=\"notificationIcon\"></div>  " +
          parser.htmlEscape( post ) + 
       "</div>");

    if ($("#notifications .system-message").length > 5) {
        $("#notifications").html("");
    } 
    else {

        setTimeout(function(){
            $(".system-message:first").animate({
                height: 0, 
                margin: 0, 
                padding: 0}, 
                500);
        }, 3000);

        setTimeout(function(){
            $(".system-message:first").remove();
        }, 4000);

    }
});

socket.on('topic', function(newTitle){
    $("#title").html(parser.htmlEscape( newTitle ));
    $("title").html(parser.htmlEscape( newTitle ));
    attributes.title = newTitle;
});

socket.on('disconnect', function(){
    autoscroll("#notifications", 
                "<div class=\"system-message\">Your socket has been disconnected.</div>");
});
