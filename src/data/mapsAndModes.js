// Créer src/data/mapsAndModes.js
const GAME_MODES = {
    'turf_war': 'Guerre de Territoire',
    'splat_zones': 'Défense de Zone',
    'tower_control': 'Mission Bazookarpe', 
    'rainmaker': 'Expédition Risquée',
    'clam_blitz': 'Pluie de Palourdes'
};

const RANKED_MODES = [
    'splat_zones',
    'tower_control', 
    'rainmaker',
    'clam_blitz'
];

const MAPS = {
    // Maps de Splatoon 3 (noms en anglais)
    'scorch_gorge': 'Canyon aux colonnes',
    'eeltail_alley': 'Banlieue Balibot',
    'hagglefish_market': 'Marché Grefin',
    'undertow_spillway': 'Réservoir Rigadelle',
    'mincemeat_metalworks': 'Casse Rascasse',
    'hammerhead_bridge': 'Pont Esturgeon',
    'museum_d_alfonsino': "Galeries Guppy",
    'mahi_mahi_resort': 'Club Ca$halot',
    'inkblot_art_academy': 'Institut Calam\'arts',
    'sturgeon_shipyard': 'Chantier Narval',
    'mako_mart': 'Supermarché Cétacé',
    'manta_maria': 'Manta Maria',
    'flounder_heights': 'Lotissement Filament',
    'brinewater_springs': 'Source Sauret',
    'bluefin_depot': 'Mine Marine',
    'robo_rom_en': 'Arène Méca-Ramen',
    'urchin_underpass': 'Passage Turbot',
    'crableg_capital': 'Quartier Crabe-Ciels',
    'shipshape_cargo_co': 'Chaland Flétan',
    'barnacle_dime': 'Halles de Port-Merlu',
    'marlin_airport': 'Terminal Rorqual',
    'wahoo_world': 'Parc Carapince',
    'um_ami_ruins': "Ruines Uma'mi",
    'humpback_pump_track': 'Piste Méroule'
};

const ALL_MAP_KEYS = Object.keys(MAPS);

module.exports = {
    GAME_MODES,
    RANKED_MODES,
    MAPS,
    ALL_MAP_KEYS
};