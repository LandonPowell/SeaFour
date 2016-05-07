# SeaFour
SeaFour is the SeaFour.club community's chat engine. 
Powered by Node.js and Socket.io.

### Depends Upon
* Node.JS
* Socket.io
* Express
* JsonFile
* SHA512

### Developer Notes
The key files responsible for the functionality of the site are server.js and 
public/client.js. 


Indents should be done in the Stroustrup variant of K&R style 
using 4-space indents like so:
```
if (x) {
    console.log("Ja!");
}
else {
    console.log("Nein!");
}
```

Whenver possible, fuctions should be defined like so:
```
function funcName(args) {
    return args + 1;
}
```

### To Run
* First, change directory to the location of your SeaFour folder. For me, this would be


  `cd ~/Prog/WebDev/SeaFour/`


* Next, npm install the dependencies in `package.json`.


  `npm install package.json`
  

* Finally, run node's server.js file.  


  `node server.js`


* You're now running SeaFour. 

Copyright (c) 2015 Landon Powell
