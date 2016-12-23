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
                     .replace(/\n/g, " <br>\n"  )
                     .replace(/\t/g, " &nbsp; &nbsp;");
    },
    quote : function(string) { /* THIS CREATES THE QUOTES/GREENTEXT */
        return string.replace(/^&gt;([^\n]+)/gm,
                              "<span class=\"quote\">&gt;$1</span>");
    },
    style : function(string) { /* S-EXPRESSION STYLE SYNTAX PARSER. */ 
    /*  Can you believe that all this was once done with a 
     *  metric fuckton of regex replaces? 
     */
        // Operators
        var operators = {
            basic: {
                "*" : "bold"    ,
                "%" : "italics" ,
                "$" : "spoiler" ,
                "^" : "big"     ,
                "~" : "rainbow" ,
                "!" : "fascists",
                "meme" : "quote",
            },
            complex: {
                "#" : "color"   ,
                "@" : "ghost"   ,
                ":" : "postLink",
                "_" : "font"    ,
                "`" : "code"    ,
            },
        };
        // Regexes for checking validity of operator args.
        var regexChecks = {
            'color'     : /([a-f\d]{3}){1,2}/gi,
            'ghost'     : /([a-f\d]{3}){1,2}/gi,
            'postLink'  : /[\w]+/g,
            'font'      : /[\w]+/g,
        };
        
        function regexEquals(string, regex) {
            return (
                regex.  test(string) && 
                string. match(regex)[0] == string &&
                string. replace(regex,"") == ""
            );
        }
        
        // Tokenizer.
        function tokenize(s) {
            s = '{ ' + s + ' }'; // Put these on here to keep shit RIGHT
            var tokens = s.replace(/&bsol;{/g,"&#123;") /* Escape codes. */
                          .replace(/&bsol;}/g,"&#125;")
                          .match(/{|}|[^\s{}]*/gi);
            return tokens;
        }

        // S-Expression Nester.
        function nest(array) { /* This is rather easy in JS. */
            var item = array.shift();
            if (item == '{') {
                var newList = [];
                while (array[0] != '}' && array.length) {
                    newList.push(nest(array));
                }
                array.shift();
                return newList;
            }
            else {
                return item;
            }
        }
        
        function linkHandler(string) { // Fucking regex.
            if ( regexEquals(string, /[\w]{1,8}:\/\/[\w\-.]+\/[^\s<]+\.(jpg|gif|svg|png|jpeg)/gi) ) {
                return "<a href=\""+string+"\" target=\"_blank\">               \
                            <img class=\"inlineimage\" src=\"/img/"+string+"\"></img>\
                        </a>";
            }
            else if ( regexEquals(string, /(https?:\/\/)?(www\.)?((youtube\.com\/watch\?v=)|(youtu\.be\/))[\w_\-]+/gi)) {
                return string.replace(/(?:https?:\/\/)?(?:www\.)?(?:(?:youtube\.com\/watch\?v=)|(?:youtu\.be\/))([\w_\-]+)/gi, 
                                      "<a class=\"youtube link\" \
                                      href=\"javascript:embedURL('https://www.youtube.com/embed/$1');\"> y </a>");
            }
            else if ( regexEquals(string, /[\w]{1,8}:\/\/[\w\-.]+(\/)?[^\s<]+/g) ) {
                return "<a class=\"link\" target=\"_blank\" href=\""+string+"\">"+string+"</a>";
            }
            else {
                return string;
            }
        }

        // S-Expression Evaluator.
        function evaluate(tree) { 
            var operator = tree.shift();
            var parsed;

            // Handles the simple operators, like (^ big text )
            if (operator in operators.basic) {
                parsed = "<span class=\""+ operators.basic[operator] +"\">";
            }
            // Handles the complex operators, like (#fff colors )
            else if (operator[0] in operators.complex) { 
                parsed = "<span class=\""+ operators.complex[operator[0]] +"\" ";

                var operation = operators.complex[operator[0]];
                var argument  = operator.substr(1);

                if ( regexEquals(argument, regexChecks[operation]) ) {
                    switch (operation) {
                        case "color":
                            parsed += "style=\" color: #" + 
                                       argument + "\">";
                            break;
                        case "ghost":
                            parsed += "style=\" text-shadow: 0px 0px 2px #" +
                                       argument + "\">";
                            break;
                        case "postLink":
                            parsed += "onclick=\"idJump('" + 
                                       argument + "')\">" + argument;
                            break;
                        case "font":
                            parsed += "style=\" font-family:" + 
                                       argument + "\">";
                            break;
                    }
                }
                else { 
                    parsed += ">";
                }
            }
            // Handles expressions using non-operators, such as ( this )
            else {
                parsed = "<span>"+linkHandler(operator); 
            }

            for (var i = 0; i < tree.length; i++) {
                if (typeof tree[i] == "object")         parsed += evaluate(tree[i]);
                else if (tree[i] == "")                 parsed += " ";
                else if (typeof tree[i] == "string")    parsed += linkHandler(tree[i]);
            }

            return parsed + "</span>";
        }

        // This returns the result of the evaluation. 
        return evaluate( nest( tokenize( string ) ) ).replace(/ </g, "<");
    }
};

function nameSanitize(nick) {   // Changes unimportant chars to dashes. 
    return nick.toLowerCase()
               .replace(/[^a-z\d]+/gi, "-")
               .replace(/-?([\w]+(?:-[\w]+)*)-?/g, "$1");
}

function flairify(nick, flair) {
    var parsedNick = parser.htmlEscape(nick);

    if (flair) {
        var parsedFlair = parser.style(
                          parser.htmlEscape(
                            flair
                          ));

        if (nameSanitize( parsedNick ) == 
            nameSanitize( parsedFlair.replace(/<[^>]+>| /g, "") ) &&
            parsedNick.length < 30 && parsedNick.indexOf("\n") < 0 )
            return parsedFlair;
        else
            return parsedNick;
    }
    else {
        return parsedNick;
    }
}
