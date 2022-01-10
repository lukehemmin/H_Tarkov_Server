"use strict";

require("../Lib.js");

class BotController
{
    static getBotLimit(type)
    {
        return BotConfig.presetBatch[(type === "cursedAssault" || type === "assaultGroup") ? "assault" : type];
    }

    static getBotDifficulty(type, difficulty)
    {
        switch (type)
        {
            // requested difficulty shared among bots
            case "core":
                return DatabaseServer.tables.bots.core;

            // don't replace type
            default:
                break;
        }

        return DatabaseServer.tables.bots.types[type].difficulty[difficulty];
    }

    static generateId(bot)
    {
        const botId = HashUtil.generate();

        bot._id = botId;
        bot.aid = botId;
        return bot;
    }

    static generateBot(bot, role)
    {
        // generate bot
        const node = DatabaseServer.tables.bots.types[role.toLowerCase()];
        const levelResult = BotController.generateRandomLevel(node.experience.level.min, node.experience.level.max);

        bot.Info.Nickname = `${RandomUtil.getArrayValue(node.firstName)} ${RandomUtil.getArrayValue(node.lastName) || ""}`;
        bot.Info.Experience = levelResult.exp;
        bot.Info.Level = levelResult.level;
        bot.Info.Settings.Experience = RandomUtil.getInt(node.experience.reward.min, node.experience.reward.max);
        bot.Info.Settings.StandingForKill = node.experience.standingForKill;
        bot.Info.Voice = RandomUtil.getArrayValue(node.appearance.voice);
        bot.Health = BotController.generateHealth(node.health);
        bot.Skills = BotController.generateSkills(node.skills);
        bot.Customization.Head = RandomUtil.getArrayValue(node.appearance.head);
        bot.Customization.Body = RandomUtil.getArrayValue(node.appearance.body);
        bot.Customization.Feet = RandomUtil.getArrayValue(node.appearance.feet);
        bot.Customization.Hands = RandomUtil.getArrayValue(node.appearance.hands);
        bot.Inventory = BotGenerator.generateInventory(node.inventory, node.chances, node.generation);

        // add dogtag to PMC's
        if (role === "usec" || role === "bear")
        {
            bot = BotController.generateDogtag(bot);
        }

        // generate new bot ID
        bot = BotController.generateId(bot);

        // generate new inventory ID
        bot = InventoryHelper.generateInventoryID(bot);

        return bot;
    }

    static generate(info, playerScav = false)
    {
        const output = [];

        for (const condition of info.conditions)
        {
            for (let i = 0; i < condition.Limit; i++)
            {
                const pmcSide = (RandomUtil.getInt(0, 99) < BotConfig.pmc.isUsec) ? "Usec" : "Bear";
                const role = condition.Role;
                const isPmc = playerScav ? false : (role in BotConfig.pmc.types && RandomUtil.getInt(0, 99) < BotConfig.pmc.types[role]);
                let bot = JsonUtil.clone(DatabaseServer.tables.bots.base);

                bot.Info.Settings.BotDifficulty = (isPmc) ? this.getPMCDifficulty(condition.Difficulty) : condition.Difficulty;
                bot.Info.Settings.Role = role;
                bot.Info.Side = (isPmc) ? pmcSide : "Savage";
                bot = BotController.generateBot(bot, (isPmc) ? pmcSide.toLowerCase() : role.toLowerCase());

                output.unshift(bot);
            }
        }

        return output;
    }

    static getPMCDifficulty(requestedDifficulty)
    {
        if (BotConfig.pmc.difficulty.toLowerCase() === "asonline")
        {
            return requestedDifficulty;
        }

        return BotConfig.pmc.difficulty;
    }

    static generateRandomLevel(min, max)
    {
        const expTable = DatabaseServer.tables.globals.config.exp.level.exp_table;
        const maxLevel = Math.min(max, expTable.length);

        // Get random level based on the exp table.
        let exp = 0;
        const level = RandomUtil.getInt(min, maxLevel);

        for (let i = 0; i < level; i++)
        {
            exp += expTable[i].exp;
        }

        // Sprinkle in some random exp within the level, unless we are at max level.
        if (level < expTable.length - 1)
        {
            exp += RandomUtil.getInt(0, expTable[level].exp - 1);
        }

        return { level, exp };
    }

    /** Converts health object to the required format */
    static generateHealth(healthObj)
    {
        return {
            "Hydration": {
                "Current": RandomUtil.getInt(healthObj.Hydration.min, healthObj.Hydration.max),
                "Maximum": healthObj.Hydration.max
            },
            "Energy": {
                "Current": RandomUtil.getInt(healthObj.Energy.min, healthObj.Energy.max),
                "Maximum": healthObj.Energy.max
            },
            "Temperature": {
                "Current": RandomUtil.getInt(healthObj.Temperature.min, healthObj.Temperature.max),
                "Maximum": healthObj.Temperature.max
            },
            "BodyParts": {
                "Head": {
                    "Health": {
                        "Current": RandomUtil.getInt(healthObj.BodyParts.Head.min, healthObj.BodyParts.Head.max),
                        "Maximum": healthObj.BodyParts.Head.max
                    }
                },
                "Chest": {
                    "Health": {
                        "Current": RandomUtil.getInt(healthObj.BodyParts.Chest.min, healthObj.BodyParts.Chest.max),
                        "Maximum": healthObj.BodyParts.Chest.max
                    }
                },
                "Stomach": {
                    "Health": {
                        "Current": RandomUtil.getInt(healthObj.BodyParts.Stomach.min, healthObj.BodyParts.Stomach.max),
                        "Maximum": healthObj.BodyParts.Stomach.max
                    }
                },
                "LeftArm": {
                    "Health": {
                        "Current": RandomUtil.getInt(healthObj.BodyParts.LeftArm.min, healthObj.BodyParts.LeftArm.max),
                        "Maximum": healthObj.BodyParts.LeftArm.max
                    }
                },
                "RightArm": {
                    "Health": {
                        "Current": RandomUtil.getInt(healthObj.BodyParts.RightArm.min, healthObj.BodyParts.RightArm.max),
                        "Maximum": healthObj.BodyParts.RightArm.max
                    }
                },
                "LeftLeg": {
                    "Health": {
                        "Current": RandomUtil.getInt(healthObj.BodyParts.LeftLeg.min, healthObj.BodyParts.LeftLeg.max),
                        "Maximum": healthObj.BodyParts.LeftLeg.max
                    }
                },
                "RightLeg": {
                    "Health": {
                        "Current": RandomUtil.getInt(healthObj.BodyParts.RightLeg.min, healthObj.BodyParts.RightLeg.max),
                        "Maximum": healthObj.BodyParts.RightLeg.max
                    }
                }
            }
        };
    }

    static generateSkills(skillsObj)
    {
        const skills = [];
        const masteries = [];

        // skills
        if (skillsObj.Common)
        {
            for (const skillId in skillsObj.Common)
            {
                skills.push({
                    "Id": skillId,
                    "Progress": RandomUtil.getInt(skillsObj.Common[skillId].min, skillsObj.Common[skillId].max),
                });
            }
        }

        // masteries
        if (skillsObj.Mastering)
        {
            for (const masteringId in skillsObj.Mastering)
            {
                masteries.push({
                    "Id": masteringId,
                    "Progress": RandomUtil.getInt(skillsObj.Mastering[masteringId].min, skillsObj.Mastering[masteringId].max)
                });
            }
        }

        return {
            "Common": skills,
            "Mastering": masteries,
            "Points": 0
        };
    }

    static generateDogtag(bot)
    {
        bot.Inventory.items.push({
            _id: HashUtil.generate(),
            _tpl: ((bot.Info.Side === "Usec") ? "59f32c3b86f77472a31742f0" : "59f32bb586f774757e1e8442"),
            parentId: bot.Inventory.equipment,
            slotId: "Dogtag",
            upd: {
                "Dogtag": {
                    "AccountId": bot.aid,
                    "ProfileId": bot._id,
                    "Nickname": bot.Info.Nickname,
                    "Side": bot.Info.Side,
                    "Level": bot.Info.Level,
                    "Time": (new Date().toISOString()),
                    "Status": "Killed by ",
                    "KillerAccountId": "Unknown",
                    "KillerProfileId": "Unknown",
                    "KillerName": "Unknown",
                    "WeaponName": "Unknown"
                },
                "SpawnedInSession": true
            }
        });

        return bot;
    }
}

module.exports = BotController;
