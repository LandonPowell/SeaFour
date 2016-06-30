var socket = io();
/* global parser flairify io nameSanitize */
var attributes = {
    nick: "unnamed",
    title: "",
    unread: 0,
    focus: true,
};

// User Interface.
/* global $ from Jquery library */
$(function() { /* On load */
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
                              "<span id=\"urlClose\" onclick=\"embedURL('kill')\"> ' "+ 
                              "</span> " +
                              "<iframe src=\"" + link + "\"></iframe>       " +
                          "</div>");

    $("#embed")
        .draggable({ containment: "#messages" })
        .resizable({
            minHeight: 51,
            minWidth: 177,
            handles: "se"
        });

    if (link == "kill")   $("#embed").remove();
}

// Command Handling.
function send(msg) { /* Setting a function allows the end-user to modify it. */
    if (msg) socket.emit('userMessage', msg);
}
function login(nick, password) {
    socket.emit('login', nick, password);
}

function keyPressed(event) {
    if(event.keyCode == 13 && !event.shiftKey) { /* Enter is pressed. */
        var text = $("#inputbox").val();
        var command = text.split(" ");
        $("#inputbox").val("");
        event.preventDefault();

        /* Special messages start with a '.' and end with '!'. */
        if (text[0] == "." && command[0][command[0].length - 1] == "!") {
            socket.emit('specialMessage', 
                        command[0].substring(1, command[0].length - 1),
                        text.substr(command[0].length + 1));
        }
        /* Direct messages start with a '.' and end with a '.'. */
        else if (text[0] == "." && command[0][command[0].length - 1] == ".") {      // This is obviously very much the same as special messages.
            socket.emit('directMessage',                                            // I should consider refactoring this code later.
                        command[0].substring(1, command[0].length - 1),             // It's not horrible, but I can do better and I should do better.
                        text.substr(command[0].length + 1));
        }
        /* Regular commands start with periods. */
        else if (text[0] == ".") {
            switch(command[0]){
                case ".login":
                    login(command[1], command[2]);
                    break;
                case ".nick":
                    socket.emit('changeNick', text.substr(6));
                    break;
                case ".embedURL":
                    embedURL(text.substr(10));
                    break;
                case ".roleChange": 
                    socket.emit('roleChange', command[1], command[2]);
                    break;
                default:
                    socket.emit(command[0].substr(1),
                                text.substr(command[0].length + 1));
            }
        }
        /* All other messages get sent. */
        else {
            send(text);
        }
    }
}

// User List Management
socket.on('listRefresh', function(newList){
    $("#usersButton").html("Users - " + newList.length);
    $("#userList").html("");
    for (var i = 0; i < newList.length; i++) {
        $("#userList").append(parser.htmlEscape(newList[i]) + "<br>");
    }
});

socket.on('nickRefresh', function(newNick){
    attributes.nick = newNick;
});

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
socket.on('userMessage', function(nick, post, id, flair){
    var postType = "message";

    if (post.toLowerCase().indexOf( nameSanitize(attributes.nick) ) + 1) { /* If post contains your nick. */
        postType += " alertMe";
        $("#notificationClick")[0].play();
    }

    var respondedTo = post.match(/{:\w+}/g) || [];
    for (var i = 0; i < respondedTo.length; i++) {

        var number = respondedTo[0].replace(/{:(\w+)}/, "$1");
        var referencedMessage = $(".message:has(#"+number+") .userName")
                                    .html()
                                    .replace(/<[^>]+>| /g, "");

        if ( referencedMessage.length && /* If post contains your post number. */
             nameSanitize(referencedMessage).indexOf( nameSanitize(attributes.nick) ) + 1 ) {

            postType += " alertMe";
            $("#notificationClick")[0].play();

        }

    }

    append("#messages", 
               "<div class=\"" + postType + "\">                                \
                   <span class=\"postId\" id=\"" + id + "\">" + id + "</span>   \
                   <span class=\"userName\">"                                   +
                    flairify(nick, flair) + "</span>: "                         +
                    parser.style(parser.quote(parser.htmlEscape( post )))       +
               "</div>");

    $("#"+id).click(function(event) {
        $("#inputbox").val(
            $("#inputbox").val() + "{:"+id+"} "
        );
    });
});

function directMessage(name) {
    $("#inputbox").val(
        "."+name+". " + $("#inputbox").val()
    );
}

socket.on('directMessage', function(direction, from, message) {
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
});

socket.on('me', function(post){
    append("#messages", 
               "<div class=\"me message\">" +
                    parser.htmlEscape(post) +
               "</div>");
});

socket.on('specialMessage', function(type, name, message) {
    append("#messages", 
               "<div class=\"message "+parser.htmlEscape(type)+"\">"+
                    parser.htmlEscape(name + ": " + message) +
               "</div>");
});

socket.on('systemMessage', function(post){
    $("#notifications").append(
       "<div class=\"systemMessage\">           " + 
       "<div class=\"notificationIcon\"></div>  " +
          parser.htmlEscape( post ) + 
       "</div>");

    if ($("#notifications .systemMessage").length > 5) {
        $("#notifications").html("");
    } 
    else {

        setTimeout(function(){
            $(".systemMessage:first").animate({
                height: 0, 
                margin: 0, 
                padding: 0}, 
                100);
        }, 3000);

        setTimeout(function(){
            $(".systemMessage:first").remove();
        }, 3100);

    }
});

socket.on('topic', function(newTitle){
    $("#title").html(parser.htmlEscape( newTitle ));
    $("title").html(parser.htmlEscape( newTitle ));
    attributes.title = newTitle;
});

socket.on('disconnect', function(){
    append("#notifications", 
                "<div class=\"systemMessage\">Your socket has been disconnected.</div>");
});
