const {Player,Lobby} = require("./Classes") // get classes from Classes file

var express = require('express'); //express module
var app = express(); 
var http = require('http').Server(app); 
var path = require('path');
var io = require('socket.io')(http); // socket io module using http
var session = require("express-session");
var sharedsession = require("express-socket.io-session");
var FileStore = require('session-file-store')(session);
const { fork } = require('child_process'); //for running game lobbies in parallel 

var rooms = [];
var checkRefresh;
var GameLoop;

// Attach session
var e_session = session({//create and use session
		store: new FileStore({ path: './user_sessions', }), // use local session store
		secret: "akjdvvps",//secret to compute hash
		resave: true, //force session to be saved to session store
		saveUninitialized: true
	});
app.use(e_session);
// Share session with io sockets
io.use(sharedsession(e_session, {
    autoSave:true
})); 

app.get('/', function(req, res){
	res.sendFile(__dirname + '/start.html'); //send the start file
});

//get static files
app.use(express.static('public'));


io.on('connection', function(socket){
	console.log('a user connected');

	socket.on("login", function(user) {
		socket.handshake.session.user = new Player(socket.id, user, 0,'', false); // creates user's session using "express-socket.io-session"
		console.log(socket.handshake.session.user);
		socket.emit('redirect', '/index.html');
		app.get('/index.html', function(req, res){
			res.sendFile(__dirname + '/index.html');//send file for redirect
		});
    });
	
	socket.on('join_game', function(){
		if(socket.handshake.session.user){
			socket.handshake.session.user.ID = socket.id; //update to new socket id when switching page
			clearTimeout(checkRefresh);
			if(!rooms.length){ //create new game room if no room exists
				rooms.push(new Lobby(0)); //push new lobby to rooms array
				socket.handshake.session.user.cur_game = 0 + ''; //set user's current game to lobby number
				rooms[0].plist.push(socket.handshake.session.user); //add user to player list for lobby
				socket.join(socket.handshake.session.user.cur_game); //user joins socket io room 
				rooms[socket.handshake.session.user.cur_game].pnumber += 1;
			}else{
				inRoom = false;
				for(var i = 0; i < rooms.length; i++) { //join first available room
					if (rooms[i].pnumber < 8 && !inRoom){
						socket.handshake.session.user.cur_game = rooms[i].number + '';
						rooms[i].plist.push(socket.handshake.session.user);
						socket.join(socket.handshake.session.user.cur_game);
						rooms[i].pnumber += 1;
						inRoom = true;
					}
				}
				if(!inRoom){ // if no room available, create new room and join
					rooms.push(new Lobby((rooms[rooms.length - 1].number + 1) + ''));
					socket.handshake.session.user.cur_game = rooms[rooms.length - 1].number + '';
					rooms[rooms.length - 1].plist.push(socket.handshake.session.user);
					socket.join(socket.handshake.session.user.cur_game);
					rooms[rooms.length - 1].pnumber++;
				}	
			}
		}else{
			socket.emit('redirect', '/');
			app.get('/', function(req, res){
				res.sendFile(__dirname + '/start.html');//send file for redirect
			});
		}
	});
	
	socket.on('kill_session', function(){
		checkRefresh = setTimeout(function(){ //check for 100 ms if player returns (refresh), else kill session
			try{
				for( var i = 0; i < rooms[socket.handshake.session.user.cur_game].pnumber; i++){ //remove player from room player list
					if ( rooms[socket.handshake.session.user.cur_game].plist[i] === socket.handshake.session.user) {
						rooms[socket.handshake.session.user.cur_game].plist.splice(i, 1); 
					}
				}
				rooms[socket.handshake.session.user.cur_game].pnumber--;
				socket.handshake.session.user.cur_game = '';
				socket.leave(socket.handshake.session.user.cur_game); //leave socket io room
				delete socket.handshake.session.user;//delete user's session
				delete socket;
				console.log('user disconnected');
			} catch (err) {
				console.error(err);
				socket.emit('redirect', '/');
				app.get('/', function(req, res){
					res.sendFile(__dirname + '/start.html');//send file for redirect
				});
			}
		}, 100);
	});
	
	
	socket.on('chat message', function(msg){ //emitting messages to users
		if(socket.handshake.session.user.cur_game){
			console.log('message: ' + msg);
			// sending to all clients in 'game' room, including sender
			if(msg != rooms[socket.handshake.session.user.cur_game].theword && socket.handshake.session.user.mute != true){
				io.to(socket.handshake.session.user.cur_game).emit('chat message',socket.handshake.session.user.name + ": " + msg);
			} else {
				socket.handshake.session.user.points += 50;
				socket.handshake.session.user.mute = true;
			}
		}
	});
	
	socket.on('load_canvas', function(){  //send previous lines for joining users
		if(socket.handshake.session.user.cur_game){
			canvas_lines = rooms[Number(socket.handshake.session.user.cur_game)].lines
			for (var i in canvas_lines){ 
				io.to(socket.id).emit('draw_line', canvas_lines[i]); //emit lines to specific joining user only
			}
		}
	});
	
	socket.on('draw_line', function(data){ //get line data
		try{
			if(rooms[Number(socket.handshake.session.user.cur_game)].pdrawing == socket.handshake.session.user){ //each round, only the player selected is able to draw
				rooms[Number(socket.handshake.session.user.cur_game)].lines.push(data); //lines are stored in game lobby object, which is stored in room array
				io.to(socket.handshake.session.user.cur_game).emit('draw_line',data); //emit data to all users in room
			}
		} catch (err) {
			console.error(err);
		}
	});
	
	socket.on('eraseAll', function(){
		if(rooms[socket.handshake.session.user.cur_game].pdrawing == socket.handshake.session.user){ //clear board if drawing player requests it
			io.to(socket.handshake.session.user.cur_game).emit('clear_canvas');
			rooms[Number(socket.handshake.session.user.cur_game)].lines = [];
		}
	});
});


http.listen(3000, function(){ //listen for connections
	console.log('listening on *:3000');
});

//game loop
var startGameLoop = setInterval(function(){ //check every 3 seconds for player number
	for (var i = 0; i < rooms.length; i++) {
		(function(i){
			if(rooms[i].pnumber >= 2 && rooms[i].pdrawing == ""){ // if lobby has at least 2 players start game
				io.to(rooms[i].number).emit('clear_canvas');
				rooms[i].gameProcess = fork('runGame.js'); //create a fork child process through lobby's gameProcess property
				rooms[i].gameProcess.send(rooms[i].pnumber + '');
				rooms[i].gameProcess.on('message', msg => { //update drawing player
					if (msg.error){ //check for errors in child process
						console.error(msg.error);
					}
					else if(msg == 'sendWord'){
						console.log(msg);
						io.to(rooms[i].number).emit('word', rooms[i].theword); //send word to all users at end of round
						for (var x = 0; x < rooms[i].pnumber ; x++){ //mute all players
							rooms[i].plist[x].mute = true;
						}
					} 
					else if(isNaN(msg)){ // get word for round (checks if msg is not a number)
						rooms[i].theword = msg;
						
					}
					else if(Number(msg) < rooms[i].pnumber){ // if chosen player is in lobby
						io.to(rooms[i].number).emit('clear_canvas');
						rooms[i].lines = [];
						rooms[i].pdrawing = rooms[i].plist[Number(msg)]; //use number of new player drawing from plist to set drawing player
						io.to(rooms[i].number).emit('startTimer', 10);
						io.to(rooms[i].pdrawing.ID).emit('word',rooms[i].theword); //send drawing player the word
						io.to(rooms[i].number).emit('word',rooms[i].theword.length); //send players word length
						for (var x = 0; x < rooms[i].pnumber ; x++){ //unmute all players
							rooms[i].plist[x].mute = false;
						}
					} 
					else { // when game ends
						io.to(rooms[i].number).emit('redirect', '/');
						app.get('/', function(req, res){
							res.sendFile(__dirname + '/start.html');//send file for redirect
						});
						rooms[i].gameProcess.kill(); //kill current game process
						rooms[i].lines = [];
						rooms[i].pdrawing = '';
						io.to(rooms[i].number).emit('waiting'); // put room in waiting mode
					}
				});
			}
			if(rooms[i].pnumber < 2){ //if less than 2 players in lobby
				if(rooms[i].gameProcess){
					io.to(rooms[i].number).emit('clear_canvas'); //clear canvas
					rooms[i].lines = [];
					rooms[i].gameProcess.kill(); //kill current game process
					rooms[i].pdrawing = '';
					io.to(rooms[i].number).emit('waiting'); // put room in waiting mode
				}
			}
			if(rooms[i].pnumber == 0){
				rooms[i].gameProcess.kill();
			}
		})(i)
	}
},3000);

