const fs = require('fs'); //module for different file system interactions
var GameLoop;
var drawingNum = 0;
var wait;
var revealWord;

try {
	var words = fs.readFileSync('wordslist.txt', 'utf8').split(","); //read file synchronously to get words before server asks for them
} catch (err) {
		process.send({error: err.message});
	}

	process.on('message', function(msg){
		try {
		switchPlayer();
		GameLoop = setInterval(function(){
			revealWord = setTimeout(function(){ // leave 5 seconds to reveal word
				process.send('sendWord');
			},10000);
			switchPlayer();
		}, 15000); // new player is selected to draw every set amount of seconds
		} catch (err) {
		process.send({error: err.message});
		}
	});


function switchPlayer(){
	try {
		process.send(words[Math.floor(Math.random()*words.length)]); //send random word from words
		process.send(drawingNum + ''); //send next drawing player's num
		drawingNum++;

	} catch (err) {
		process.send({error: err.message});
	}
}