class Camp {
    constructor(name) {
        this.name = name;
        this.score = 0;
    }

    addScore(points) {
        this.score += points;
    }

    resetScore() {
        this.score = 0;
    }
}

module.exports = Camp;