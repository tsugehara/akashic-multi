declare var console: any;
interface Player {
	id: string;
	power: number;
	wait: number;
	cssColor: string;
	defaultDirection: Direction;
}

interface PlayerManagerSettings {
	maxPlayerCount: number;
}

class PlayerManager {
	maxPlayerCount: number;
	playerCount: number;
	players: {[key: string]: Player};

	constructor(settings: PlayerManagerSettings) {
		this.maxPlayerCount = settings.maxPlayerCount;
		this.playerCount = 0;
		this.players = {};
	}

	getDefaultColor() {
		switch (this.playerCount) {
			case 1:
			return "red";
			case 2:
			return "blue";
			default:	// TODO: 2playerまでしかサポートしてない
			return "black";
		}
	}

	addPlayer(player: g.Player, cssColor?: string) {
		if (this.players.hasOwnProperty(player.id)) return null;
		++this.playerCount;
		this.players[player.id] = {
			id: player.id,
			power: 100,
			wait: 10,
			cssColor: cssColor == null ? this.getDefaultColor() : cssColor,
			defaultDirection: this.playerCount == 1 ? "right" : "left"	// TODO: 2 playerのみ対応
		}
		return this.playerCount;
	}

	elapse() {
		Object.keys(this.players).forEach((key) => {
			if (this.players[key].wait > 0) {
				--this.players[key].wait;
			}
		})
	}

	isJoinedPlayer(idOrPlayer: string | g.Player) {
		if (typeof idOrPlayer === "string") {
			return this.players.hasOwnProperty(idOrPlayer);
		}
		return this.players.hasOwnProperty(idOrPlayer.id);
	}

	tryGetJoinedPlayer(idOrPlayer: string | g.Player): Player | null {
		if (! this.isJoinedPlayer(idOrPlayer)) return null;
		if (typeof idOrPlayer === "string") {
			return this.players[idOrPlayer];
		}
		return this.players[idOrPlayer.id];
	}
}

type Direction = "left" | "right";

interface FireSettings {
	scene: g.Scene;
	direction: Direction;
	point: g.CommonOffset;
	size: number;
	speed: number;
	cssColor?: string;
	view?: g.E;
}

class Fire {
	view: g.E;
	direction: Direction;
	speed: number;
	maxSize: number;
	currentSize: number;
	dead: g.Trigger<Fire>;

	constructor(settings: FireSettings) {
		this.direction = settings.direction;
		this.speed = settings.speed;
		if (settings.view == null) {
			this.view = new g.FilledRect({
				scene: settings.scene,
				x: 0,	// TODO: この辺ちょっとださい
				y: 0,
				width: 1,
				height: 1,
				cssColor: settings.cssColor!,
				parent: settings.scene	// TODO: おかしい
			});
		} else {
			this.view = settings.view;
		}
		this.view.x = settings.point.x - settings.size / 2;
		this.view.y = settings.point.y - settings.size / 2;
		this.view.width = settings.size;
		this.view.height = settings.size;
		this.maxSize = settings.size;
		this.currentSize = settings.size;
		this.view.modified();
		this.dead = new g.Trigger();
	}

	elapse() {
		switch (this.direction) {
			case "left":
				this.view.x -= this.speed;
				this.view.modified();
				break;
			case "right":
				this.view.x += this.speed;
				this.view.modified();
				break;
			default:
			throw new Error("undefined directon: " + this.direction);
		}
	}

	damage(p: number) {
		this.currentSize -= p;
		if (this.currentSize < 1) {
			this.kill();
			return true;
		}
		this.view.width = this.currentSize;
		this.view.height = this.currentSize;
		this.view.modified();
		// TODO: 位置も調整した方が自然
		return false;
	}

	kill() {
		this.currentSize = 0;
		this.view.destroy();
		this.dead.fire(this);
	}

	getCenterPosition() {
		return {
			x: this.view.x + this.currentSize / 2,
			y: this.view.y + this.currentSize / 2
		};
	}
}

class BonusArea {
	direction: Direction;
	x: number;
	y: number;

	constructor(direction: Direction, x: number, y: number) {
		this.direction = direction;
		this.x = x;
		this.y = y;
	}

	isGoal(p: g.CommonOffset) {
		switch (this.direction) {
			case "left":
			if (p.x <= this.x) return true;
			break;
			case "right":
			if (p.x >= this.x) return true;
			break;
		}
		return false;
	}
}

interface DirectionDamage {
	direction: Direction;
	damage: number;
}

class FireManager {
	fires: Fire[];
	defaultSpeed: number;
	defaultSize: number;
	bonusAreas: {[key: string]: BonusArea};
	directionDamaged: g.Trigger<DirectionDamage>;

	constructor(bonusAreas: {[key: string]: BonusArea}) {
		this.fires = [];
		this.defaultSize = 10;
		this.defaultSpeed = 1;
		this.bonusAreas = bonusAreas;
		this.directionDamaged = new g.Trigger();
	}

	addFire(player: Player, scene: g.Scene, point: g.CommonOffset) {
		const fire = new Fire({
			scene: scene,
			direction: player.defaultDirection,
			cssColor: player.cssColor,
			speed: this.defaultSpeed,
			size: this.defaultSize,
			point: point
		});
		fire.dead.add(this.onFireDead, this);
		this.fires.push(fire);
	}

	onFireDead(fire: Fire) {
		const index = this.fires.indexOf(fire);
		if (index === -1) return;	// Note: エラーにするべきかも？
		this.fires.splice(index, 1);
	}

	elapse() {
		// 移動
		for (let i = 0; i < this.fires.length; i++) {
			this.fires[i].elapse();
		}
		// 接触判定
		for (let i = 0; i < this.fires.length - 1; i++) {
			for (let j = i + 1; j < this.fires.length; j++) {
				if (g.Collision.intersectAreas(this.fires[i].view, this.fires[j].view)) {
					const tmpSize = this.fires[j].currentSize;
					if (this.fires[j].damage(this.fires[i].currentSize)) {
						--j;
					}
					if (this.fires[i].damage(tmpSize)) {
						--i;
						break;
					}
				}
			}
		}
		// 到達判定
		for (let i = 0; i < this.fires.length; i++) {
			const fire = this.fires[i];
			if (this.bonusAreas[fire.direction].isGoal(fire.getCenterPosition())) {
				this.directionDamaged.fire({
					direction: fire.direction,
					damage: fire.currentSize
				});
				fire.kill();
				--i;
			}
		}
	}
}

function main(param: g.GameMainParameterObject): void {
	const scene = new g.Scene({game: g.game});
	const playerManager = new PlayerManager({
		maxPlayerCount: 2
	});
	const fireManager = new FireManager({
		"left": new BonusArea("left", 0, 0),
		"right": new BonusArea("right", g.game.width, g.game.height)
	});

	fireManager.directionDamaged.add((damage) => {
		// TODO: implement here（二人目が不在の時とかで面倒くさくなってしまった・・）
		console.log("damaged", damage);
	});

	// これをjoin契機ではなくタッチイベント契機にしとけばニコ生向け
	// 陣営判定をランダムにでもするのかな・・
	g.game.join.add((e) => {
		if (e.player && e.player.id) {
			playerManager.addPlayer(e.player);
		}
	});

	scene.loaded.add(() => {
		// なんかしようかと思ったけど特にやることがない
	});

	scene.update.add(() => {
		playerManager.elapse();
		fireManager.elapse();
	});

	function attack(player: Player, point: g.CommonOffset) {
		player.wait = 10;
		fireManager.addFire(player, scene, point);
	}

	// これをローカルエンティティ & raiseEventにしとけば大人数向け
	scene.pointDownCapture.add((e) => {
		if (! e.player || ! e.player.id) return;
		const player = playerManager.tryGetJoinedPlayer(e.player);
		if (player == null) return;
		if (player.wait > 0) return;
		attack(player, e.point);
	});
	g.game.pushScene(scene);
}

// TODO: 面倒くさくなってしまった項目群
// - ボーナスエリア判定をちゃんとやる
// - ボーナスエリア付近で撃てないようにする（奥地の方から撃てばポイント多めにする）
// - 勝敗判定処理を作る
// - 参加処理とかをちゃんと作る（参加待ちゲームなのでもうちょいちゃんとなる）
// - waitゲージを表示する
// - powerゲージを表示する

export = main;
