class Player {
	constructor(ID, name, points,cur_game, mute) {
		this.ID = ID;
		this.name = name;
		this.points = points;
		this.cur_game = cur_game;
		this.mute = mute;
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
		this.pass = "";
	}
}
module.exports = {Player, Lobby};