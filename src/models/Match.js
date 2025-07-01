class Match {
    constructor(team1, team2) {
        this.team1 = team1;
        this.team2 = team2;
        this.results = {
            team1: null,
            team2: null
        };
    }

    setResult(team, result) {
        if (team !== this.team1 && team !== this.team2) {
            throw new Error("Invalid team");
        }
        if (result !== 'V' && result !== 'D') {
            throw new Error("Result must be 'V' for victory or 'D' for defeat");
        }

        this.results[team] = result;
    }

    isMatchComplete() {
        return this.results.team1 !== null && this.results.team2 !== null;
    }

    getWinner() {
        if (!this.isMatchComplete()) {
            throw new Error("Match is not complete yet");
        }
        if (this.results.team1 === 'V' && this.results.team2 === 'D') {
            return this.team1;
        } else if (this.results.team1 === 'D' && this.results.team2 === 'V') {
            return this.team2;
        } else {
            return null; // It's a draw or both teams lost
        }
    }
}

module.exports = Match;