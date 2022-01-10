"use strict";

module.exports = {
    "redeemTime": 48,
    "daily":
    {
        "types": ["Elimination", "Completion", "Exploration"],
        "resetTime": 60 * 60 * 24,
        "numQuests": 5,
        "minPlayerLevel": 1,
        "rewardScaling": {
            "levels": [1, 20, 45, 100],
            "experience":  [2000, 4000, 20000, 80000],
            "roubles": [6000, 10000, 100000, 250000],
            "items": [1, 2, 4, 4],
            "reputation": [0.01, 0.01, 0.01, 0.01],
            "rewardSpread": 0.5 // spread for factor of reward at 0.5 the reward according to level is multiplied by a random value between 0.5 and 1.5
        },
        "locations": {
            "any": ["any"],
            "factory4_day": ["factory4_day", "factory4_night"],
            "bigmap": ["bigmap"],
            "Woods": ["Woods"],
            "Shoreline": ["Shoreline"],
            "Interchange": ["Interchange"],
            "Lighthouse": ["Lighthouse"],
            "laboratory": ["laboratory"],
            "RezervBase": ["RezervBase"]
        },
        "questConfig": {
            "Exploration": {
                "maxExtracts": 3
            },
            "Completion": {
                "minRequestedAmount": 1,
                "maxRequestedAmount": 5,
                "minRequestedBulletAmount": 20,
                "maxRequestedBulletAmount": 60,
                "useWhitelist": true,
                "useBlacklist": false,
            },
            "Elimination": {
                "targets": {
                    "Savage": 7,
                    "AnyPmc": 2,
                    "bossBully": 0.5
                },
                "bodyPartProb": 0.4,
                "bodyParts": {
                    "Head": 1,
                    //"LeftArm": 0.5,
                    //"RightArm": 0.5,
                    //"LeftLeg": 0.5,
                    //"RightLeg": 0.5,
                    "Stomach": 3,
                    "Chest": 5
                },
                "specificLocationProb": 0.25,
                "distProb": 0.25,
                "maxDist": 200,
                "minDist": 20,
                "maxKills": 5,
                "minKills": 2
            }
        }
    }
};

// Request for dailies has been according to wiki:
// level 45+
// add reward randomistion:
// 20,000 to 80,000 exp
// 100,000 to 250,000 roubles
// 700 to 1750 euros if from peacekeeper
// 1 to 4 items
//
// level 21-45
// add reward randomistion:
// up to 20,000 exp
// up to 100,000 roubles
// up to 700 if from peacekeeper
// 1 to 4 items
//
// level 5-20
// add reward randomistion:
// up to 2000 exp
// up to 10,000 roubles
// up to 70 if from peacekeeper
// 1 to 2 items
//
// quest types:
// exit location
// extract between 1 and 5 times from location
//
// elimination PMC
// kill between 2-15 PMCs
// from a distance between 20-50 meters
// kill via damage from a particular body part
//
// elimination scav
// kill between 2-15 scavs
// from a distance between 20-50 meters
// kill via damage from a particular body part
//
// boss elimination
// any distance OR from a distance of more than 80
//
// find and transfer
// find and handover a random number of items
// items are random