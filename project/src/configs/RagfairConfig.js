"use strict";

module.exports = {
    "sell": {
        "fees": true,
        "chance": {
            "base": 50,
            "overprices": 0.5,
            "underpriced": 2
        },
        "time": {
            "base": 15,
            "min": 5,
            "max": 15
        },
        "reputation": {
            "gain": 0.0000002,
            "loss": 0.0000002
        }
    },
    "traders": {
        "54cb50c76803fa8b248b4571": true,
        "54cb57776803fa99248b456e": true,
        "579dc571d53a0658a154fbec": false,
        "58330581ace78e27b8b10cee": true,
        "5935c25fb3acc3127c3d8cd9": true,
        "5a7c2eca46aef81a7ca2145d": true,
        "5ac3b934156ae10c4430e83c": true,
        "5c0647fdd443bc2504c2d371": true,
        "ragfair": false
    },
    "dynamic": {
        "expiredOfferThreshold": 1000,
        "offerItemCount": {
            "min": 1,
            "max": 30
        },
        "price": {
            "min": 0.8,
            "max": 1.2
        },
        "endTimeSeconds": {
            "min": 180,
            "max": 1800
        },
        "condition": {
            "min": 0.5,
            "max": 1
        },
        "stackablePercent": {
            "min": 10,
            "max": 500
        },
        "nonStackableCount": {
            "min": 1,
            "max": 10
        },
        "rating": {
            "min": 0.1,
            "max": 0.95
        },
        "currencies": {
            "5449016a4bdc2d6f028b456f": 75,
            "5696686a4bdc2da3298b456a": 23,
            "569668774bdc2da2298b4568": 2
        },
        "showAsSingleStack": [
            "5422acb9af1c889c16000029",
            "5448e54d4bdc2dcc718b4568",
            "5795f317245977243854e041",
            "5448e53e4bdc2d60728b4567",
            "5448bf274bdc2dfc2f8b456a",
            "543be5e94bdc2df1348b4568",
            "5448f39d4bdc2d0a728b4568"
        ],
        "blacklist": {
            "custom": [
                "55d7217a4bdc2d86028b456d",
                "5af99e9186f7747c447120b8",
                "557596e64bdc2dc2118b4571",
                "566abbb64bdc2d144c8b457d",
                "5cdeb229d7f00c000e7ce174", // NSV static MG
                "5cffa483d7ad1a049e54ef1c" // static MG ammo belt
            ],
            "enableBsgList": true,
            "enableQuestList": true
        }
    }
};