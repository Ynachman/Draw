const {Player,Lobby} = require("./Classes") // get classes from Classes file

var express = require('express'); //express module
var app = express(); 
var http = require('http').Server(app); //
var path = require('path');
var io = require('socket.io')(http); // socket io module using http
var session = require("express-session")({//create and use session
		secret: "my-secret",//secret to compute hash
		resave: true,
		saveUninitialized: true
	})
var sharedsession = require("express-socket.io-session");
const { fork } = require('child_process'); //for running game lobbies in parallel 

var rooms = [];
var checkRefresh;
var GameLoop;

// Attach session
app.use(session);
// Share session with io sockets
io.use(sharedsession(session, {
    autoSave:true
})); 

app.get('/', function(req, res){
	res.sendFile(__dirname + '/start.html'); //send the start file
});

//get static files
app.use( express.static('public'));


io.on('connection', function(socket){
	console.log('a user connected');
	clientIp = socket.request.connection.remoteAddress;

	socket.on("login", function(user) {
		socket.handshake.session.user = new Player(clientIp, user, 0,''); // creates user's session using "express-socket.io-session"
		var destination = '/index.html';
		socket.emit('redirect', destination);
		app.get('/index.html', function(req, res){
			res.sendFile(__dirname + '/index.html');//send file for redirect
		});
    });
	
	socket.on('join_game', function(){
		clearTimeout(checkRefresh);
		if(!rooms.length){ //create new game room if no room exists
			rooms.push(new Lobby(0)); //push new lobby to rooms array
			socket.handshake.session.user.cur_game = 0 + ''; //set user's current game to lobby number
			rooms[0].plist.push(socket.handshake.session.user); //add user to player list for lobby
			socket.join(socket.handshake.session.user.cur_game); //user joins socket io room 
			rooms[socket.handshake.session.user.cur_game].pnumber += 1;
		}
		else{
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
	});
	
	socket.on('kill_session', function(){
		checkRefresh = setTimeout(function(){ //check for 100 ms if player returns (refresh), else kill session
			for( var i = 0; i < rooms[socket.handshake.session.user.cur_game].pnumber; i++){ //remove player from room player list
				if ( rooms[socket.handshake.session.user.cur_game].plist[i] === socket.handshake.session.user) {
					rooms[socket.handshake.session.user.cur_game].plist.splice(i, 1); 
				}
			}
			rooms[socket.handshake.session.user.cur_game].pnumber--;
			socket.handshake.session.user.cur_game = '';
			socket.leave(socket.handshake.session.user.cur_game); //leave socket io room
			if (socket.handshake.session.user) { //delete user's session
				delete socket.handshake.session.user;
			}
			console.log('user disconnected');
		}, 100);
	});
	
	
	socket.on('chat message', function(msg){ //emitting messages to users
		console.log('message: ' + msg);
		// sending to all clients in 'game' room, including sender
		io.to(socket.handshake.session.user.cur_game).emit('chat message',socket.handshake.session.user.name + ": " + msg);
	});
	
	socket.on('load_canvas', function(){  //send previous lines for joining users
			canvas_lines = rooms[Number(socket.handshake.session.user.cur_game)].lines
			for (var i in canvas_lines){ 
				io.to(socket.id).emit('draw_line', canvas_lines[i]); //emit lines to specific joining user only
			}
	});
	
	socket.on('draw_line', function(data){ //get line data
		if(rooms[socket.handshake.session.user.cur_game].pdrawing == socket.handshake.session.user){ //each round, only the player selected is able to draw
			rooms[Number(socket.handshake.session.user.cur_game)].lines.push(data); //lines are stored in game lobby object, which is stored in room array
			io.to(socket.handshake.session.user.cur_game).emit('draw_line',data); //emit data to all users in room
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
				io.to(rooms[i].number).emit('clear_canvas','');
				rooms[i].gameProcess = fork('runGame.js'); //create a fork child process through lobby's gameProcess property
				rooms[i].gameProcess.send(rooms[i].pnumber + '');
				rooms[i].gameProcess.on('message', msg => { //update drawing player
					if (msg.error){ //check for errors in child process
						console.error(msg.error);
					} else {
						if(isNaN(msg)){ // get word for round (checks if msg is not a number)
							rooms[i].theword = msg;
							console.log(rooms[i].theword);
						} else {
							rooms[i].pdrawing = rooms[i].plist[Number(msg)]; //use number of new player drawing from plist to set drawing player
						}
					}
				});
			}
			else if(rooms[i].pnumber < 2){
				if(rooms[i].gameProcess){
					io.to(rooms[i].number).emit('clear_canvas','');
					rooms[i].lines = [];
					rooms[i].gameProcess.kill();
					rooms[i].pdrawing = '';
					console.log('bingo');
					io.to(rooms[i].number).emit('waiting');
				}
			}
		})(i)
	}
},3000);

