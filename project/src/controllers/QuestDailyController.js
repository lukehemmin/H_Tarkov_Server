"use strict";

require("../Lib.js");


class QuestDailyController
{
    /**
     * This is the method reached by the /client/repeatalbeQuests/activityPeriods endpoint
     * Returns an array of objects in the format of repeatable quests to the client.
     * repeatableQuestObject = {
     *  id: Unique Id,
     *  name: "Daily",
     *  endTime: the time when the quests expire
     *  activeQuests: currently available dailies in an array. Each element of quest type format (see assets/database/templates/dailyQuests.json).
     *  inactiveQuests: the quests which were previously active (required by client to fail them if they are not completed)
     * }
     *
     * The method checks if the player level requirement for dailies is met and if the previously active quests
     * are still valid (checked by creation timestamp persisted in profile and the duration for the dailies condigured in QuestCondig.js)
     *
     * If the condition is met, new dailies are created, old dailies (which are persisted in the profile.Dailies.Available) are moved to inactiveQuests
     * and to profile.Dailies.Complete (this memory is required to get rid of old dailies data in the profile, otherwise they'll litter the profile)
     * (if the are on Succeed but not completed we keep them, to allow the player to complete them and get the rewards)
     * The new quests are then persisted in profile.Dailies.Available
     *
     * The possiblity that more than one of the "repeatableQuestObjects" can be returned most likely is to also provide weeklies.
     *
     * @param   {string}    sessionId       Player's session id
     * @return  {array}                     array of "repeatableQuestObjects" as descibed above
     */
    static GetClientDailyQuests(info, sessionID)
    {
        const pmcData = ProfileController.getPmcProfile(sessionID);

        const time = TimeUtil.getTimestamp();
        const inactiveQuests = [];

        if (pmcData.Info.Level >= QuestConfig.daily.minPlayerLevel)
        {
            if (time > (pmcData.Dailies.TimeCreated + QuestConfig.daily.resetTime))
            {
                console.log("Generating new dailies");

                pmcData.Dailies.TimeCreated = time;

                // put old dailies to inactive (this is required since only then the client makes them fail due to non-completion)
                // we also need to push them to the "Complete" list since we need to remove them from offraidData.profile.Quests
                // after a raid (the client seems to keep quests internally and we want to get rid of old dailies)
                // and remove them from the PMC's Quests and Dailies.Available
                const questsToKeep = [];
                for (let i = 0; i < pmcData.Dailies.Available.length; i++)
                {
                    const qid = pmcData.Dailies.Available[i]._id;

                    // check if the quest is ready to be completed, if so, don't remove it
                    const quest = pmcData.Quests.filter(q => q.qid === qid);
                    if (quest.length > 0)
                    {
                        if (quest[0].status === "AvailableForFinish")
                        {
                            questsToKeep.push(pmcData.Dailies.Available[i]);
                            continue;
                        }
                    }
                    pmcData.ConditionCounters.Counters = pmcData.ConditionCounters.Counters.filter(c => c.qid !== qid);
                    pmcData.Quests = pmcData.Quests.filter(q => q.qid !== qid);
                    inactiveQuests.push(pmcData.Dailies.Available[i]);
                    pmcData.Dailies.Complete.push(pmcData.Dailies.Available[i]);
                }
                pmcData.Dailies.Available = questsToKeep;

                // Generate new debug dailies
                //const dailyQuests = DatabaseServer.tables.templates.dailyQuests.samples.slice();
                //pmcData.Dailies.Available = pmcData.Dailies.Available.concat(QuestDailyController.GenerateDebugDailies(dailyQuests, true, 4));

                // introduce a dynamic backlist to avoid duplicates
                const questTypePool = QuestDailyController.GenerateQuestPool();

                for (let i = 0; i < QuestConfig.daily.numQuests; i++)
                {
                    let daily = null;
                    let lifeline = 0;
                    while (!daily && questTypePool.types.length > 0)
                    {
                        daily = QuestDailyController.GenerateDailyQuest(pmcData.Info.Level, questTypePool);
                        lifeline++;
                        if (lifeline > 10)
                        {
                            Logger.debug("We were stuck in daily generation. This should never happen. Please report.");
                            break;
                        }
                    }

                    // check if there are no more quest types available
                    if (questTypePool.types.length === 0)
                    {
                        break;
                    }
                    pmcData.Dailies.Available.push(daily);
                }
            }
            else
            {
                console.log("Dailies still valid.");
            }
        }

        var returnData = [];
        returnData.push({
            id: HashUtil.generate(),
            name: "Daily",
            endTime: pmcData.Dailies.TimeCreated + QuestConfig.daily.resetTime,
            activeQuests: pmcData.Dailies.Available,
            inactiveQuests: inactiveQuests
        });

        return returnData;
    }

    /**
     * This method is called by GetClientDailyQuests and creates one element of quest type format (see assets/database/templates/dailyQuests.json).
     * It randomly draws a quest type (currently Elimination, Completion or Exploration) as well as a trader who is providing the quest
     *
     * @param   {string}    pmcLevel        Player's level which is used for reward generation (and can in the future be used for quest difficulty)
     * @return  {object}                    object of quest type format (see assets/database/templates/dailyQuests.json)
     */
    static GenerateDailyQuest(pmcLevel, questTypePool)
    {
        const questTypes = questTypePool.types;

        const missionType = RandomUtil.DrawRandomFromList(questTypes)[0];
        const traders = [
            TraderHelper.getTraderIdByName("prapor"),
            TraderHelper.getTraderIdByName("therapist"),
            TraderHelper.getTraderIdByName("skier"),
            TraderHelper.getTraderIdByName("peacekeeper"),
            TraderHelper.getTraderIdByName("mechanic"),
            TraderHelper.getTraderIdByName("ragman"),
            TraderHelper.getTraderIdByName("jaeger"),
        ];
        const traders_elimination = [
            TraderHelper.getTraderIdByName("prapor"),
            TraderHelper.getTraderIdByName("therapist"),
            TraderHelper.getTraderIdByName("skier"),
            TraderHelper.getTraderIdByName("peacekeeper"),
            TraderHelper.getTraderIdByName("ragman"),
            TraderHelper.getTraderIdByName("jaeger"),
        ];

        let traderId = null;
        if (missionType === "Elimination")
        {
            traderId = RandomUtil.DrawRandomFromList(traders_elimination)[0]; // mechanic has no elimination mission
        }
        else
        {
            traderId = RandomUtil.DrawRandomFromList(traders)[0];
        }

        switch (missionType)
        {
            case "Elimination":
                return QuestDailyController.GenerateEliminationQuest(pmcLevel, traderId, questTypePool);
            case "Completion":
                return QuestDailyController.GenerateCompletionQuest(pmcLevel, traderId);
            case "Exploration":
                return QuestDailyController.GenerateExplorationQuest(pmcLevel, traderId, questTypePool);
            default:
                throw "Unknown mission type. Should never be here!";
        }
    }

    /**
     * Just for debug reasons. Draws dailies a random assort of dailies extracted from dumps
     *
     * @param   {array}     dailiesPool     array of dailies, for format see assets/database/templates/dailyQuests.json
     * @param   {boolean}   factory         if set, a factory extaction quest will always be added (fast completion possible for debugging)
     * @param   {integer}   N               amount of quests to draw
     * @return  {object}                    array of objects of quest type format (see assets/database/templates/dailyQuests.json)
     */
    static GenerateDebugDailies(dailiesPool, factory, N)
    {
        let randomQuests = [];
        if (factory)
        {
            // first is factory extract always add for debugging
            randomQuests.push(dailiesPool[0]);
            N -= 1;
        }

        randomQuests = randomQuests.concat(RandomUtil.DrawRandomFromList(dailiesPool, 3, false));

        for (let i = 0; i < randomQuests.length; i++)
        {
            randomQuests[i]._id = ObjectId.generate();
            const conditions = randomQuests[i].conditions.AvailableForFinish;
            for (let i = 0; i < conditions.length; i++)
            {
                if ("counter" in conditions[i]._props)
                {
                    conditions[i]._props.counter.id = ObjectId.generate();
                }
            }
        }
        return randomQuests;
    }

    /**
     * Generates the base object of quest type format given as templates in assets/database/templates/dailyQuests.json
     * The templates include Elimination, Completion and Extraction quest types
     *
     * @param   {string}    type            quest type: "Elimination", "Completion" or "Extraction"
     * @param   {string}    traderId        trader from which the quest will be provided
     * @return  {object}                    a object which contains the base elements for dailies of the requests type
     *                                      (needs to be filled with reward and conditions by called to make a valid quest)
     */
    static GenerateDailyTemplate(type, traderId)
    {
        const quest = JsonUtil.clone(DatabaseServer.tables.templates.dailyQuests.templates[type]);
        quest._id = ObjectId.generate();
        quest.traderId = traderId;
        quest.name = quest.name.replace("{traderId}", traderId);
        quest.note = quest.note.replace("{traderId}", traderId);
        quest.description = quest.description.replace("{traderId}", traderId);
        quest.successMessageText = quest.successMessageText.replace("{traderId}", traderId);
        quest.failMessageText = quest.failMessageText.replace("{traderId}", traderId);
        quest.startedMessageText = quest.startedMessageText.replace("{traderId}", traderId);
        return quest;
    }

    /**
     * Generates a valid Exploration quest
     *
     * @param   {integer}   pmcLevel        player's level for reward generation
     * @param   {string}    traderId        trader from which the quest will be provided
     * @param   {object}    questTypePool   Pools for quests (used to avoid redundant quests)
     * @return  {object}                    object of quest type format for "Exploration" (see assets/database/templates/dailyQuests.json)
     */
    static GenerateExplorationQuest(pmcLevel, traderId, questTypePool)
    {
        const EXPLORATION = QuestConfig.daily.questConfig.Exploration;

        if (Object.keys(questTypePool.pool.Exploration.locations).length === 0)
        {
            // there are no more locations left for exploration; delete it as a possible quest type
            questTypePool.types = questTypePool.types.filter(t => t !== "Exploration");
            return null;
        }

        // if the location we draw is factory, it's possible to either get factory4_day and factory4_night or only one
        // of the both
        const locationKey = RandomUtil.DrawRandomFromDict(questTypePool.pool.Exploration.locations)[0];
        const locationTarget = questTypePool.pool.Exploration.locations[locationKey];
        // if (locationKey === "factory4_day")
        // {
        //     locationTarget = RandomUtil.DrawRandomFromList(LOCATIONS["factory4_day"], RandomUtil.RandInt(1, 3), false);
        // }

        // remove the location from the available pool
        delete questTypePool.pool.Exploration.locations[locationKey];

        const numExtracts = RandomUtil.RandInt(1, EXPLORATION.maxExtracts + 1);

        const quest = QuestDailyController.GenerateDailyTemplate("Exploration", traderId);

        quest.conditions.AvailableForFinish[0]._props.counter.conditions[1]._props.id = ObjectId.generate();
        quest.conditions.AvailableForFinish[0]._props.counter.conditions[1]._props.target = locationTarget;
        quest.conditions.AvailableForFinish[0]._props.counter.conditions[0]._props.id = ObjectId.generate();
        quest.conditions.AvailableForFinish[0]._props.counter.id = ObjectId.generate();
        quest.conditions.AvailableForFinish[0]._props.value = numExtracts;
        quest.conditions.AvailableForFinish[0]._props.id = ObjectId.generate();
        quest.location = locationKey;

        // difficulty for exploration goes from 1 extract to maxExtracts
        // difficulty for reward goes from 0.2...1 -> map
        const difficulty = MathUtil.mapToRange(numExtracts, 1, EXPLORATION.maxExtracts, 0.2, 1);

        quest.rewards = QuestDailyController.GenerateReward(pmcLevel, difficulty, traderId);

        return quest;
    }

    /**
     * Generates a valid Completion quest
     *
     * @param   {integer}   pmcLevel        player's level for requested items and reward generation
     * @param   {string}    traderId        trader from which the quest will be provided
     * @return  {object}                    object of quest type format for "Completion" (see assets/database/templates/dailyQuests.json)
     */
    static GenerateCompletionQuest(pmcLevel, traderId)
    {
        const COMPLETION = QuestConfig.daily.questConfig.Completion;
        const LEVELS = QuestConfig.daily.rewardScaling.levels;
        const ROUBLES = QuestConfig.daily.rewardScaling.roubles;

        // in the available dumps only 2 distinct items were ever requested
        let numberDistinctItems = 1;
        if (Math.random() > 0.75)
        {
            numberDistinctItems = 2;
        }

        const quest = QuestDailyController.GenerateDailyTemplate("Completion", traderId);

        // filter the items.json for valid items to ask in Complition quest: shouldn't be a quest item or "non-existant"
        let itemSelection = ItemHelper.getRewardableItems();

        // be fair, don't let the items be more expensive than the reward
        let roublesBudget = Math.floor(MathUtil.Interp1(pmcLevel, LEVELS, ROUBLES) * RandomUtil.getFloat(0.5, 1));
        itemSelection = itemSelection.filter(x => ItemHelper.getItemPrice(x[0]) < roublesBudget);

        // we also have the option to use whitelist and/or blacklist which is defined in dailyQuests.json as
        // [{"minPlayerLevel": 1, "itemIds": ["id1",...]}, {"minPlayerLevel": 15, "itemIds": ["id3",...]}]
        if (QuestConfig.daily.questConfig.Completion.useWhitelist)
        {
            const itemWhitelist = DatabaseServer.tables.templates.dailyQuests.data.Completion.itemsWhitelist;
            // we filter and concatenate the arrays according to current player level
            const itemIdsWhitelisted = itemWhitelist.filter(p => p.minPlayerLevel < pmcLevel).reduce((a, p) => a.concat(p.itemIds), []);
            itemSelection = itemSelection.filter(x =>
            {
                return itemIdsWhitelisted.some(v => ItemHelper.isOfBaseclass(x[0], v));
            });
            // check if items are missing
            //const flatList = itemSelection.reduce((a, il) => a.concat(il[0]), []);
            //const missing = itemIdsWhitelisted.filter(l => !flatList.includes(l));
        }

        if (QuestConfig.daily.questConfig.Completion.useBlacklist)
        {
            const itemBlacklist = DatabaseServer.tables.templates.dailyQuests.data.Completion.itemsBlacklist;
            // we filter and concatenate the arrays according to current player level
            const itemIdsBlacklisted = itemBlacklist.filter(p => p.minPlayerLevel < pmcLevel).reduce((a, p) => a.concat(p.itemIds), []);
            itemSelection = itemSelection.filter(x =>
            {
                return itemIdsBlacklisted.every(v => !ItemHelper.isOfBaseclass(x[0], v));
            });
        }

        if (itemSelection.length === 0)
        {
            Logger.error("Generate Completion Daily: No items remain. Either Whitelist is too small or Blacklist to restrictive.");
            return null;
        }

        // draw the items to request
        for (let i = 0; i < numberDistinctItems; i++)
        {
            const itemSelected = itemSelection[RandomUtil.RandInt(itemSelection.length)];
            const itemUnitPrice = ItemHelper.getItemPrice(itemSelected[0]);
            let minValue = COMPLETION.minRequestedAmount;
            let maxValue = COMPLETION.maxRequestedAmount;
            if (ItemHelper.isOfBaseclass(itemSelected[0], ItemHelper.BASECLASS.Ammo))
            {
                minValue = COMPLETION.minRequestedBulletAmount;
                maxValue = COMPLETION.maxRequestedBulletAmount;
            }
            let value = minValue;

            // get the value range within budget
            maxValue = Math.min(maxValue, Math.floor(roublesBudget / itemUnitPrice));
            if (maxValue > minValue)
            {
                // if it doesn't blow the budget we have for the request, draw a random amount of the selected
                // item type to be requested
                value = RandomUtil.RandInt(minValue, maxValue + 1);
            }
            roublesBudget -= value * itemUnitPrice;

            // push a CompletionCondition with the item and the amount of the item
            quest.conditions.AvailableForFinish.push(QuestDailyController.GenerateCompletionCondition(itemSelected[0], value));

            if (roublesBudget > 0)
            {
                // reduce the list possible items to fulfill the new budget constraint
                itemSelection = itemSelection.filter(x => ItemHelper.getItemPrice(x[0]) < roublesBudget);
                if (itemSelection.length === 0)
                {
                    break;
                }
            }
            else
            {
                break;
            }
        }

        quest.rewards = QuestDailyController.GenerateReward(pmcLevel, 1, traderId);

        return quest;
    }

    /**
     * Generates a valid Elimination quest
     *
     * @param   {integer}   pmcLevel        player's level for requested items and reward generation
     * @param   {string}    traderId        trader from which the quest will be provided
     * @param   {object}    questTypePool   Pools for quests (used to avoid redundant quests)
     * @return  {object}                    object of quest type format for "Elimination" (see assets/database/templates/dailyQuests.json)
     */
    static GenerateEliminationQuest(pmcLevel, traderId, questTypePool)
    {
        const ELIMINATION = QuestConfig.daily.questConfig.Elimination;
        const LOCATIONS = QuestConfig.daily.locations;
        let TARGETS = JsonUtil.clone(ELIMINATION.targets);

        // the difficulty of the quest varies in difficulty depending on the condition
        // possible conditions are
        // - amount of npcs to kill
        // - type of npc to kill (scav, boss, pmc)
        // - with hit to what body part they should be killed
        // - from what distance they should be killed
        // a random combination of listed conditions can be required
        // possible conditions elements and their relative probability can be defined in QuestConfig.js
        // We use "probability dictionaries" to draw by relative probability. e.g. for targets:
        // "targets": {
        //    "Savage": 7,
        //    "AnyPmc": 2,
        //    "bossBully": 0.5
        //}
        // higher is more likely. We define the difficulty to be the inverse of the relative probability.

        // We want to generate a reward which is scaled by the difficulty of this mission. To get a upper bound with which we scale
        // the actual difficulty we calculate the minimum and maximum difficulty (max being the sum of max of each condition type
        // times the number of kills we have to perform):

        // the minumum difficulty is the difficulty for the most probable (= easiest target) with no additional conditions
        const minDifficulty = 1 / RandomUtil.probDictMax(ELIMINATION.targets); // min difficulty is lowest amount of scavs without any constraints

        // Target on bodyPart max. difficulty is that of the least probable element
        const maxTargetDifficulty = 1 / RandomUtil.probDictMin(ELIMINATION.targets);
        const maxBodyPartsDifficulty = ELIMINATION.minKills / RandomUtil.probDictMin(ELIMINATION.bodyParts);

        // maxDistDifficulty is defined by 2, this could be a tuning parameter if we don't like the reward generation
        const maxDistDifficulty = 2;

        const maxKillDifficulty = ELIMINATION.maxKills;

        function difficultyWeighing(target, bodyPart, dist, kill)
        {
            return Math.sqrt(Math.sqrt(target) + bodyPart + dist) * kill;
        }


        TARGETS = Object.fromEntries(Object.entries(TARGETS).filter(([k, v]) => Object.keys(questTypePool.pool.Elimination.targets).includes(k)));
        if (Object.keys(TARGETS).length === 0 || (Object.keys(TARGETS).length === 1 && TARGETS[0] === "bossBully"))
        {
            // there are no more targets left for elimination; delete it as a possible quest type
            // also if only bossBully is left we drop. Otherwise we certainly would get a bossBully quest
            // if all other targets were drawn - then it would not be a quest with low probsbility anymore
            questTypePool.types = questTypePool.types.filter(t => t !== "Elimination");
            return null;
        }

        const target = RandomUtil.DrawFromDictByProb(TARGETS)[0];
        const targetDifficulty = 1 / TARGETS[target];

        let locations = questTypePool.pool.Elimination.targets[target].locations;
        // we use any as location if "any" is in the pool and we do not hit the specific location random
        // we use any also if the random condition is not met in case only "any" was in the pool
        let locationKey = "any";
        if (locations.includes("any") && (QuestConfig.daily.questConfig.Elimination.specificLocationProb < Math.random() || locations.length <= 1))
        {
            locationKey = "any";
            delete questTypePool.pool.Elimination.targets[target];
        }
        else
        {
            locations = locations.filter(l => l !== "any");
            if (locations.length > 0)
            {
                locationKey = RandomUtil.DrawRandomFromList(locations)[0];
                questTypePool.pool.Elimination.targets[target].locations = locations.filter(l => l !== locationKey);
                if (questTypePool.pool.Elimination.targets[target].locations.length === 0)
                {
                    delete questTypePool.pool.Elimination.targets[target];
                }
            }
            else
            {
                // never should reach this if everything works out
                Logger.debug("Ecountered issue when creating elimination daily. Please report.");
            }
        }

        // draw the target body part and calculate the difficulty factor
        let bodyPart = null;
        let bodyPartDifficulty = 0;
        if (ELIMINATION.bodyPartProb > Math.random())
        {
            // if we add a bodyPart condition, we draw randomly one or two parts
            bodyPart = RandomUtil.DrawFromDictByProb(ELIMINATION.bodyParts, RandomUtil.RandInt(1, 3), false);
            let probability = 0;
            for (let i = 0; i < bodyPart.length; i++)
            {
                // more than one part lead to an "OR" condition hence more parts reduce the difficulty
                probability += ELIMINATION.bodyParts[bodyPart[i]];
            }
            bodyPartDifficulty = 1 / probability;
        }

        // draw a distance condition
        let distance = null;
        let distanceDifficulty = 0;
        if (ELIMINATION.distProb > Math.random())
        {
            // random distance with lower values more likely; simple distribution for starters...
            distance = Math.floor(Math.abs(Math.random() - Math.random()) * (1 + ELIMINATION.maxDist - ELIMINATION.minDist) + ELIMINATION.minDist);
            distance = Math.ceil(distance / 5) * 5;
            distanceDifficulty = maxDistDifficulty * distance / ELIMINATION.maxDist;
        }

        // draw how many npcs are required to be killed
        const kills = RandomUtil.RandInt(ELIMINATION.minKills, ELIMINATION.maxKills + 1);
        const killDifficulty = kills;

        // not perfectly happy here; we give difficulty = 1 to the quest reward generation when we have the most diffucult mission
        // e.g. killing reshala 5 times from a distance of 200m with a headshot.
        const maxDifficulty = difficultyWeighing(1, 1, 1, 1);
        const curDifficulty = difficultyWeighing(
            targetDifficulty / maxTargetDifficulty,
            bodyPartDifficulty / maxBodyPartsDifficulty,
            distanceDifficulty / maxDistDifficulty,
            killDifficulty / maxKillDifficulty
        );

        // aforementioned issue makes it a bit crazy since now all easier quests give significantly lower rewards than Completion / Exploration
        // I therefore moved the mapping a bit up (from 0.2...1 to 0.5...2) so that normal difficulty still gives good reward and having the
        // crazy maximum difficulty will lead to a higher difficulty reward gain factor than 1
        const difficulty = MathUtil.mapToRange(curDifficulty, minDifficulty, maxDifficulty, 0.5, 2);

        const quest = QuestDailyController.GenerateDailyTemplate("Elimination", traderId);

        quest.conditions.AvailableForFinish[0]._props.counter.id = ObjectId.generate();
        quest.conditions.AvailableForFinish[0]._props.counter.conditions = [];
        if (locationKey !== "any")
        {
            quest.conditions.AvailableForFinish[0]._props.counter.conditions.push(QuestDailyController.GenerateEliminationLocation(LOCATIONS[locationKey]));
        }
        quest.conditions.AvailableForFinish[0]._props.counter.conditions.push(QuestDailyController.GenerateEliminationCondition(target, bodyPart, distance));
        quest.conditions.AvailableForFinish[0]._props.value = kills;
        quest.conditions.AvailableForFinish[0]._props.id = ObjectId.generate();
        quest.location = locationKey;

        quest.rewards = QuestDailyController.GenerateReward(pmcLevel, Math.min(difficulty, 1), traderId);

        return quest;
    }


    /**
     * A daily quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/dailyQuests.json)
     * This is a helper method for GenerateCompletionQuest to create a completion condition (of which a completion quest theoretically can have many)
     *
     * @param   {string}    targetItemId    id of the item to request
     * @param   {integer}   value           amount of items of this specific type to request
     * @return  {object}                    object of "Completion"-condition
     */
    static GenerateCompletionCondition(targetItemId, value)
    {
        let minDurability = 0;
        if (ItemHelper.isOfBaseclass(targetItemId, ItemHelper.BASECLASS.Weapon) || ItemHelper.isOfBaseclass(targetItemId, ItemHelper.BASECLASS.Armor))
        {
            minDurability = 80;
        }
        return {
            "_props": {
                "id": ObjectId.generate(),
                "parentId": "",
                "dynamicLocale": true,
                "index": 0,
                "visibilityConditions": [],
                "target": [targetItemId],
                "value": value,
                "minDurability": minDurability,
                "maxDurability": 100,
                "dogtagLevel": 0,
                "onlyFoundInRaid": true
            },
            "_parent": "HandoverItem",
            "dynamicLocale": true
        };
    }

    /**
     * A daily quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/dailyQuests.json)
     * This is a helper method for GenerateEliminationQuest to create a location condition.
     *
     * @param   {string}    location        the location on which to fulfill the elimination quest
     * @return  {object}                    object of "Elimination"-location-subcondition
     */
    static GenerateEliminationLocation(location)
    {
        return {
            "_props": {
                "target": location,
                "id": ObjectId.generate(),
                "dynamicLocale": true
            },
            "_parent": "Location"
        };
    }

    /**
     * A daily quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/dailyQuests.json)
     * This is a helper method for GenerateEliminationQuest to create a kill condition.
     *
     * @param   {string}    target          array of target npcs e.g. "AnyPmc", "Savage"
     * @param   {array}     bodyParts       array of body parts with which to kill e.g. ["stomach", "thorax"]
     * @param   {number}    distance        distance from which to kill (currently only >= supported)
     * @return  {object}                    object of "Elimination"-kill-subcondition
     */
    static GenerateEliminationCondition(target, bodyPart, distance)
    {
        const killCondition = {
            "_props": {
                "value": 1,
                "id": ObjectId.generate(),
                "dynamicLocale": true
            },
            "_parent": "Kills"
        };

        killCondition._props.target = target;
        if (target === "bossBully")
        {
            killCondition._props.target = "Savage";
            killCondition._props.savageRole = ["bossBully"];
        }

        if (bodyPart)
        {
            killCondition._props.bodyPart = bodyPart;
        }

        if (distance)
        {
            killCondition._props.distance = {
                "compareMethod": ">=",
                "value": distance
            };
        }

        return killCondition;
    }

    /**
     * Used to create a quest pool during each cycle of dailies generation. The pool will be subsequently
     * narrowed down during quest generation to avoid duplicate quests. Like duplicate extractions or elimination quests
     * where you have to e.g. kill scavs in same locations.
     *
     * @return  {object}                    the quest pool
     */
    static GenerateQuestPool()
    {
        const questPool = {
            types: QuestConfig.daily.types.slice(),
            pool: {
                "Exploration": {
                    "locations": Object.fromEntries(Object.entries(QuestConfig.daily.locations).filter(([k, v]) => k !== "any"))
                },
                "Elimination": {
                    "targets": {}
                }
            }
        };

        for (const [key, val] of Object.entries(QuestConfig.daily.questConfig.Elimination.targets))
        {
            if (key !== "bossBully")
            {
                questPool.pool.Elimination.targets[key] = { "locations": Object.keys(QuestConfig.daily.locations) };
            }
            else
            {
                questPool.pool.Elimination.targets[key] = { "locations": ["any"] };
            }
        }

        return questPool;
    }

    /**
     * Generate the reward for a mission. A reward can consist of
     * - Experience
     * - Money
     * - Items
     * - Trader Reputation
     *
     * The reward is dependent on the player level as given by the wiki. The exact mapping of pmcLevel to
     * experience / money / items / trader reputation can be defined in QuestConfig.js
     *
     * There's also a random variation of the reward the spread of which can be also defined in the config.
     *
     * Additonaly, a scaling factor w.r.t. quest difficulty going from 0.2...1 can be used
     *
     * @param   {integer}   pmcLevel        player's level
     * @param   {number}    difficulty      a reward scaling factor goint from 0.2 to 1
     * @param   {string}    traderId        the trader for reputation gain (and possible in the future filtering of reward item type based on trader)
     * @return  {object}                    object of "Reward"-type that can be given to a daily mission
     */
    static GenerateReward(pmcLevel, difficulty, traderId)
    {
        // difficulty could go from 0.2 ... -> for lowest diffuculty receive 0.2*nominal reward
        const LEVELS = QuestConfig.daily.rewardScaling.levels;
        const ROUBLES = QuestConfig.daily.rewardScaling.roubles;
        const XP =  QuestConfig.daily.rewardScaling.experience;
        const ITEMS = QuestConfig.daily.rewardScaling.items;
        const REWARD_SPREAD = QuestConfig.daily.rewardScaling.rewardSpread;
        const REPUTATION = QuestConfig.daily.rewardScaling.reputation;

        // rewards are generated based on pmcLevel, difficulty and a random spread
        const rewardXP = Math.floor(difficulty * MathUtil.Interp1(pmcLevel, LEVELS, XP) * RandomUtil.getFloat(1 - REWARD_SPREAD, 1 + REWARD_SPREAD));
        const rewardRoubles = Math.floor(difficulty * MathUtil.Interp1(pmcLevel, LEVELS, ROUBLES) * RandomUtil.getFloat(1 - REWARD_SPREAD, 1 + REWARD_SPREAD));
        const rewardNumItems = RandomUtil.RandInt(1, Math.round(MathUtil.Interp1(pmcLevel, LEVELS, ITEMS)) + 1);
        const rewardReputation = Math.round(100 * difficulty * MathUtil.Interp1(pmcLevel, LEVELS, REPUTATION)
                                                * RandomUtil.getFloat(1 - REWARD_SPREAD, 1 + REWARD_SPREAD)) / 100;


        // possible improvement -> draw trader-specific items e.g. with ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.FoodDrink)
        let roublesBudget = rewardRoubles;

        // first filter for type and baseclass to avoid lookup in handbook for non-available items
        const rewardableItems = ItemHelper.getRewardableItems();
        // blacklist
        let itemSelection = rewardableItems.filter(x =>     !ItemHelper.isOfBaseclass(x[0], ItemHelper.BASECLASS.DogTagUsec)
                                                        &&  !ItemHelper.isOfBaseclass(x[0], ItemHelper.BASECLASS.DogTagBear)
        );
        itemSelection = itemSelection.filter(x => ItemHelper.getItemPrice(x[0]) < roublesBudget);

        const rewards = {
            "Started": [],
            "Success": [
                {
                    "value": rewardXP,
                    "type": "Experience",
                    "index": 0
                }
            ],
            "Fail": [],
        };

        if (traderId !== TraderHelper.getTraderIdByName("peacekeeper"))
        {
            rewards.Success.push(QuestDailyController.GenerateRewardItem(ItemHelper.MONEY.Roubles, rewardRoubles, 1));
        }
        else
        {
            // convert to equivalent dollars
            rewards.Success.push(QuestDailyController.GenerateRewardItem(ItemHelper.MONEY.Dollars, Math.floor(rewardRoubles / 142.86), 1));
        }

        let index = 2;
        if (itemSelection.length > 0)
        {
            for (let i = 0; i < rewardNumItems; i++)
            {
                let value = 1;
                const itemSelected = itemSelection[RandomUtil.RandInt(itemSelection.length)];
                if (ItemHelper.isOfBaseclass(itemSelected[0], ItemHelper.BASECLASS.Ammo))
                {
                    // if we provide ammo we don't to provide just one bullet
                    value = RandomUtil.RandInt(1, itemSelected[1]._props.StackMaxSize + 1);
                }
                rewards.Success.push(QuestDailyController.GenerateRewardItem(itemSelected[0], value, index));
                roublesBudget -= value * ItemHelper.getItemPrice(itemSelected[0]);
                index += 1;
                // if we still have budget narrow down the items
                if (roublesBudget > 0)
                {
                    itemSelection = itemSelection.filter(x => ItemHelper.getItemPrice(x[0]) < roublesBudget);
                    if (itemSelection.length === 0)
                    {
                        break;
                    }
                }
                else
                {
                    break;
                }
            }
        }

        if (rewardReputation > 0)
        {
            rewards.Success.push({
                "target": traderId,
                "value": rewardReputation,
                "type": "TraderStanding",
                "index": index
            });
        }

        return rewards;
    }

    /**
     * Helper to create a reward item structured as required by the client
     *
     * @param   {string}    tpl             itemId of the rewarded item
     * @param   {integer}   value           amount of items to give
     * @param   {integer}   index           all rewards will be appended to a list, for unkown reasons the client wants the index
     * @return  {object}                    object of "Reward"-item-type
     */
    static GenerateRewardItem(tpl, value, index)
    {
        const id = ObjectId.generate();
        return {
            "target": id,
            "value": value,
            "type": "Item",
            "index": index,
            "items": [{
                "_id": id,
                "_tpl": tpl,
                "upd": {
                    "StackObjectsCount": value
                }
            }]
        };
    }
}

module.exports = QuestDailyController;