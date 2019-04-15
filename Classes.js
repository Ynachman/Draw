class Player {
	constructor(IP, name, points,cur_game) {
		this.IP = IP;
		this.name = name;
		this.points = points;
		this.cur_game = cur_game;
	}
}

class Lobby {
	constructor(number) {
		this.number = number;
		this.plist = [];
		this.pnumber = 0;
		this.lines = [];
		this.pdrawing = "";
		this.theword = "";
		this.gameProcess;
	}
}
module.exports = {Player, Lobby};