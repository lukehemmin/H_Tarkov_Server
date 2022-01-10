"use strict";

module.exports = {
    "presetBatch": {
        "assault": 120,
        "bossBully": 1,
        "bossGluhar": 1,
        "bossKilla": 1,
        "bossKojaniy": 1,
        "bossSanitar": 1,
        "bossTagilla": 1,
        "bossTest": 40,
        "cursedAssault": 120,
        "followerBully": 4,
        "followerGluharAssault": 2,
        "followerGluharScout": 2,
        "followerGluharSecurity": 2,
        "followerGluharSnipe": 2,
        "followerKojaniy": 2,
        "followerSanitar": 2,
        "followerTagilla": 2,
        "followerTest": 4,
        "marksman": 30,
        "pmcBot": 120,
        "sectantPriest": 1,
        "sectantWarrior": 5,
        "gifter": 1,
        "test": 40,
        "exUsec": 15
    },
    "bosses": ["bossbully", "bossgluhar", "bosskilla", "bosskojaniy", "bosssanitar", "bosstagilla"],
    "durability":{
        "pmc": {
            "armor": {
                "minPercent": 80
            },
            "weapon": {
                "minPercent": 80
            }
        },
        "boss": {
            "armor": {
                "minPercent": 50
            },
            "weapon": {
                "minPercent": 50
            }
        }
    },
    "pmc": {
        "difficulty": "AsOnline",
        "isUsec": 50,
        "usecType": "bosstest",
        "bearType": "test",
        "types": {
            "assault": 35,
            "cursedAssault": 35,
            "pmcBot": 35
        }
    },
    "showTypeInNickname": false,
    "maxBotCap": 20
};