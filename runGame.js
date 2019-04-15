const fs = require('fs'); //module for different file system interactions
var path = require('path');
var GameLoop;
var drawingNum = 0;
var playerNum;

try {
	var words = fs.readFileSync('wordslist.txt', 'utf8').split(","); //read file synchronously to get words before server asks for them
} catch (err) {
		process.send({error: err.message});
	}

try {
	process.on('message', function(players){
		playerNum = players
		switchPlayer();
		GameLoop = setInterval(switchPlayer, 40000); // new player is selected to draw every 40 seconds
	});
} catch (err) {
		process.send({error: err.message});
	}

function switchPlayer(){
	try {
		if(drawingNum<Number(playerNum)){ // if hasn't iterated over all players
			process.send(words[Math.floor(Math.random()*words.length)]);
			process.send(drawingNum + ''); //send next drawing player's num
			drawingNum++;
		}
		else {
			clearInterval(GameLoop);
		}
	} catch (err) {
		process.send({error: err.message});
	}
}