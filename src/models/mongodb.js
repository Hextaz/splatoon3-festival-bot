const mongoose = require('mongoose');

// Schéma pour les festivals
const festivalSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    title: { type: String, required: true },
    campNames: { type: [String], required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    modes: { type: [String], required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Schéma pour les équipes
const teamSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    festivalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Festival' },
    name: { type: String, required: true },
    leaderId: { type: String, required: true },
    members: [{ type: String }], // Discord user IDs
    camp: { type: String, required: true },
    isOpen: { type: Boolean, default: true },
    accessCode: { type: String },
    channelId: { type: String }, // Discord channel ID
    roleId: { type: String }, // Discord role ID
    isSearching: { type: Boolean, default: false },
    lastSearchTime: { type: Date },
    searchLockUntil: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Schéma pour les votes
const voteSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    festivalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Festival' },
    userId: { type: String, required: true }, // Discord user ID
    camp: { type: String, required: true },
    votedAt: { type: Date, default: Date.now }
});

// Schéma pour les matchs
const matchSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    festivalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Festival' },
    team1Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    team2Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    team1Name: { type: String, required: true },
    team2Name: { type: String, required: true },
    team1Camp: { type: String, required: true },
    team2Camp: { type: String, required: true },
    bo3: [{
        map: { type: String, required: true },
        mode: { type: String, required: true }
    }],
    results: [{
        map: { type: String },
        mode: { type: String },
        winner: { type: String }, // team1 or team2
        team1Score: { type: Number },
        team2Score: { type: Number }
    }],
    status: { 
        type: String, 
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    winnerName: { type: String },
    finalScore: { type: String }, // "2-1", "2-0", etc.
    confirmedBy: [{ type: String }], // Discord user IDs who confirmed results
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date }
});

// Schéma pour les scores par camp
const campScoreSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    festivalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Festival' },
    camp: { type: String, required: true },
    totalPoints: { type: Number, default: 0 },
    matchesWon: { type: Number, default: 0 },
    matchesLost: { type: Number, default: 0 },
    teamsCount: { type: Number, default: 0 },
    votesCount: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

// Schéma pour l'historique des probabilités de maps
const mapProbabilitySchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    festivalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Festival' },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    mapMode: { type: String, required: true }, // "map_mode" format
    timesPlayed: { type: Number, default: 0 },
    timesWon: { type: Number, default: 0 },
    probability: { type: Number, default: 0.5 },
    lastUpdated: { type: Date, default: Date.now }
});

// Schéma pour la configuration par serveur
const guildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    festivalChannelId: { type: String },
    adminRoleId: { type: String },
    announceChannelId: { type: String },
    teamCategoryId: { type: String },
    settings: {
        autoCleanup: { type: Boolean, default: true },
        maxTeamsPerUser: { type: Number, default: 1 },
        maxMembersPerTeam: { type: Number, default: 4 },
        enableAnonymousVoting: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Index pour optimiser les requêtes
festivalSchema.index({ guildId: 1, isActive: 1 });
teamSchema.index({ guildId: 1, festivalId: 1 });
voteSchema.index({ guildId: 1, festivalId: 1, userId: 1 }, { unique: true });
matchSchema.index({ guildId: 1, festivalId: 1 });
campScoreSchema.index({ guildId: 1, festivalId: 1, camp: 1 }, { unique: true });
mapProbabilitySchema.index({ guildId: 1, festivalId: 1, teamId: 1, mapMode: 1 }, { unique: true });

module.exports = {
    Festival: mongoose.model('Festival', festivalSchema),
    Team: mongoose.model('Team', teamSchema),
    Vote: mongoose.model('Vote', voteSchema),
    Match: mongoose.model('Match', matchSchema),
    CampScore: mongoose.model('CampScore', campScoreSchema),
    MapProbability: mongoose.model('MapProbability', mapProbabilitySchema),
    GuildConfig: mongoose.model('GuildConfig', guildConfigSchema)
};
