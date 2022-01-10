"use strict";

require("../Lib.js");

class QuestController
{
    static getClientQuests(sessionID)
    {
        const quests = [];
        const allQuests = QuestController.questValues();
        const profile = ProfileController.getPmcProfile(sessionID);

        for (const quest of allQuests)
        {
            // If a quest is already in the profile we need to just add it
            if (profile.Quests.includes(pq => pq.qid === quest._id))
            {
                quests.push(quest);
                continue;
            }

            // Don't add quests that have a level higher than the user's
            const levels = QuestHelper.getLevelConditions(quest.conditions.AvailableForStart);

            if (levels.length)
            {
                if (!QuestHelper.evaluateLevel(profile, levels[0]))
                {
                    continue;
                }
            }

            // If the quest has no quest conditions then add to visible quest list
            const conditions = QuestHelper.getQuestConditions(quest.conditions.AvailableForStart);

            if (conditions.length === 0)
            {
                quests.push(quest);
                continue;
            }

            let canSend = true;

            // Check the status of each quest condition, if any are not completed
            // then this quest should not be visible
            for (const condition of conditions)
            {
                const previousQuest = profile.Quests.find(pq => pq.qid === condition._props.target);

                // If the previous quest isn't in the user profile, it hasn't been completed or started
                if (!previousQuest)
                {
                    canSend = false;
                    break;
                }

                // If previous is in user profile, check condition requirement and current status
                if (previousQuest.status === Object.keys(QuestHelper.status)[condition._props.status[0]])
                {
                    continue;
                }

                // Chemical fix: "Started" Status is catered for above. This will include it just if it's started.
                // but maybe this is better:
                // if ((condition._props.status[0] === QuestHelper.status.Started)
                // && (previousQuest.status === "AvailableForFinish" || previousQuest.status ===  "Success")
                if ((condition._props.status[0] === QuestHelper.status.Started))
                {
                    const statusName = Object.keys(QuestHelper.status)[condition._props.status[0]];
                    Logger.debug(`[QUESTS]: fix for polikhim bug: ${quest._id} (${QuestHelper.getQuestLocale(quest._id).name}) ${condition._props.status[0]}, ${statusName} != ${previousQuest.status}`);
                    continue;
                }
                canSend = false;
                break;
            }

            if (canSend)
            {
                quests.push(QuestController.cleanQuestConditions(quest));
            }
        }
        return quests;
    }

    static GetClientDailyQuests(sessionID)
    {
        //TODO:
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


        const dailyQuests = DatabaseServer.tables.templates.dailyQuests;

        const time = Math.round(new Date().getTime() / 1000);
        const time24HoursTomorrow = time + (24 * 3600);
        var returnData = [];
        returnData.push({
            id: HashUtil.generate(),
            name: "Daily",
            endTime: time24HoursTomorrow,
            activeQuests: dailyQuests.activeQuests,
            inactiveQuests: []
        });

        return returnData;
    }

    static getFindItemIdForQuestItem(itemTpl)
    {
        for (const quest of QuestController.questValues())
        {
            const conditions = quest.conditions.AvailableForFinish.filter(
                c =>
                {
                    return c._parent === "FindItem";
                });

            for (const condition of conditions)
            {
                if (condition._props.target.includes(itemTpl))
                {
                    return condition._props.id;
                }
            }
        }
    }

    static processReward(reward)
    {
        let rewardItems = [];
        let targets = [];
        const mods = [];

        let itemCount = 1;

        for (const item of reward.items)
        {
            // reward items are granted Found in Raid
            if (!item.upd)
            {
                item.upd = {};
            }

            item.upd.SpawnedInSession = true;

            // separate base item and mods, fix stacks
            if (item._id === reward.target)
            {
                if ((item.parentId !== undefined) && (item.parentId === "hideout") && (item.upd !== undefined) && (item.upd.StackObjectsCount !== undefined) && (item.upd.StackObjectsCount > 1))
                {
                    itemCount = item.upd.StackObjectsCount;
                    item.upd.StackObjectsCount = 1;
                }
                targets = ItemHelper.splitStack(item);
            }
            else
            {
                mods.push(item);
            }
        }

        // add mods to the base items, fix ids
        for (const target of targets)
        {
            const items = [target];

            for (const mod of mods)
            {
                items.push(JsonUtil.clone(mod));
            }

            for (let i = 0; i < itemCount; i++)
            {
                rewardItems = rewardItems.concat(ItemHelper.replaceIDs(null, items));
            }
        }

        return rewardItems;
    }

    /* Gets a flat list of reward items for the given quest and state
    * input: quest, a quest object
    * input: state, the quest status that holds the items (Started, Success, Fail)
    * output: an array of items with the correct maxStack
    */
    static getQuestRewardItems(quest, state)
    {
        let questRewards = [];

        for (const reward of quest.rewards[state])
        {
            if ("Item" === reward.type)
            {
                questRewards = questRewards.concat(QuestController.processReward(reward));
            }
        }

        return questRewards;
    }

    static applyQuestReward(pmcData, body, state, sessionID)
    {
        const output = ItemEventRouter.getOutput(sessionID);
        let intelCenterBonus = 0; // percentage of money reward

        // find if player has money reward boost
        const area = pmcData.Hideout.Areas.find(area => area.type === 11);
        if (area)
        {
            if (area.level === 1)
            {
                intelCenterBonus = 5;
            }

            if (area.level > 1)
            {
                intelCenterBonus = 15;
            }
        }

        const pmcQuest = pmcData.Quests.find(quest => quest.qid === body.qid);
        if (pmcQuest)
        {
            pmcQuest.status = state;
        }

        // give reward
        let quest = QuestController.getQuestFromDb(body.qid);

        if (intelCenterBonus > 0)
        {
            quest = QuestController.applyMoneyBoost(quest, intelCenterBonus);    // money = money + (money * intelCenterBonus / 100)
        }

        for (const reward of quest.rewards[state])
        {
            switch (reward.type)
            {
                case "Skill":
                    QuestHelper.rewardSkillPoints(sessionID, pmcData, output, reward.target, reward.value);
                    break;

                case "Experience":
                    pmcData = ProfileController.getPmcProfile(sessionID);
                    pmcData.Info.Experience += parseInt(reward.value);
                    output.profileChanges[sessionID].experience = pmcData.Info.Experience;
                    break;

                case "TraderStanding":
                    pmcData = ProfileController.getPmcProfile(sessionID);
                    pmcData.TradersInfo[reward.target].standing += parseFloat(reward.value);

                    if (pmcData.TradersInfo[reward.target].standing < 0)
                    {
                        pmcData.TradersInfo[reward.target].standing = 0;
                    }

                    TraderController.lvlUp(reward.target, sessionID);
                    break;

                case "TraderUnlock":
                    TraderController.changeTraderDisplay(reward.target, true, sessionID);
                    break;
            }
        }

        return QuestController.getQuestRewardItems(quest, state);
    }

    static acceptQuest(pmcData, acceptedQuest, sessionID)
    {
        const state = "Started";
        const existingQuest = pmcData.Quests.find(q => q.qid === acceptedQuest.qid);
        QuestController.addQuestToPMCData(pmcData, existingQuest, state, acceptedQuest);

        // Create a dialog message for starting the quest.
        // Note that for starting quests, the correct locale field is "description", not "startedMessageText".
        const quest = QuestController.getQuestFromDb(acceptedQuest.qid);
        let startedMessageId = QuestController.getQuestLocaleIdFromDb(quest.startedMessageText);
        const questRewards = QuestController.getQuestRewardItems(quest, state);

        // blank or is a guid, use description instead (its always a guid...)
        if (startedMessageId === "" || startedMessageId.length === 24)
        {
            startedMessageId = QuestController.getQuestLocaleIdFromDb(quest.description);
        }

        const messageContent = {
            "templateId": startedMessageId,
            "type": DialogueController.getMessageTypeValue("questStart"),
            "maxStorageTime": QuestConfig.redeemTime * 3600
        };

        DialogueController.addDialogueMessage(quest.traderId, messageContent, sessionID, questRewards);

        const acceptQuestResponse = ItemEventRouter.getOutput(sessionID);
        acceptQuestResponse.profileChanges[sessionID].quests = QuestController.acceptedUnlocked(acceptedQuest.qid, sessionID);
        return acceptQuestResponse;
    }

    static acceptDailyQuest(pmcData, acceptedQuest, sessionID)
    {
        const state = "Started";
        const quest = pmcData.Quests.find(q => q.qid === acceptedQuest.qid);
        QuestController.addQuestToPMCData(pmcData, quest, state, acceptedQuest);

        const dailyQuestDb = DatabaseServer.tables.templates.dailyQuests.activeQuests.find(x => x._id === acceptedQuest.qid);
        const locale = DatabaseServer.tables.locales.global["en"];
        let questStartedMessageKey = locale.repeatableQuest[dailyQuestDb.startedMessageText];
        const questStartedMessageText = locale.mail[questStartedMessageKey];

        // if value is blank or a guid
        if (questStartedMessageText.trim() === "" || questStartedMessageText.length === 24)
        {
            questStartedMessageKey = locale.repeatableQuest[dailyQuestDb.description];
        }

        const questRewards = QuestController.getQuestRewardItems(dailyQuestDb, state);
        const messageContent = {
            "templateId": questStartedMessageKey,
            "type": DialogueController.getMessageTypeValue("questStart"),
            "maxStorageTime": QuestConfig.redeemTime * 3600
        };

        DialogueController.addDialogueMessage(dailyQuestDb.traderId, messageContent, sessionID, questRewards);

        const acceptQuestResponse = ItemEventRouter.getOutput(sessionID);
        acceptQuestResponse.profileChanges[sessionID].quests = QuestController.acceptedUnlocked(acceptedQuest.qid, sessionID);
        return acceptQuestResponse;
    }

    static addQuestToPMCData(pmcData, quest, newState, acceptedQuest)
    {
        if (quest)
        {
            // If the quest already exists, update its status
            quest.startTime = TimeUtil.getTimestamp();
            quest.status = newState;
        }
        else
        {
            // If the quest doesn't exists, add it
            pmcData.Quests.push({
                "qid": acceptedQuest.qid,
                "startTime": TimeUtil.getTimestamp(),
                "status": newState,
                "completedConditions": []
            });
        }
    }

    static completeQuest(pmcData, body, sessionID)
    {
        const beforeQuests = QuestController.getClientQuests(sessionID);
        const questRewards = QuestController.applyQuestReward(pmcData, body, "Success", sessionID);

        //Check if any of linked quest is failed, and that is unrestartable.
        const checkQuest = QuestController.questValues().filter((q) =>
        {
            return q.conditions.Fail.length > 0 && q.conditions.Fail[0]._props.target === body.qid;
        });

        for (const checkFail of checkQuest)
        {
            if (checkFail.conditions.Fail[0]._props.status[0] === QuestHelper.status.Success)
            {
                const checkQuestId = pmcData.Quests.find(qq => qq.qid === checkFail._id);

                if (checkQuestId)
                {
                    const failBody = { "Action": "QuestComplete", "qid": checkFail._id, "removeExcessItems": true };
                    QuestController.failQuest(pmcData, failBody, sessionID);
                }
                else
                {
                    const questData = {
                        "qid": checkFail._id,
                        "startTime": TimeUtil.getTimestamp(),
                        "status": "Fail"
                    };
                    pmcData.Quests.push(questData);
                }
            }
        }

        // Create a dialog message for completing the quest.
        const quest = QuestController.getQuestFromDb(body.qid);
        const successMessageId = QuestController.getQuestLocaleIdFromDb(quest.successMessageText);
        const messageContent = {
            "templateId": successMessageId,
            "type": DialogueController.getMessageTypeValue("questSuccess"),
            "maxStorageTime": QuestConfig.redeemTime * 3600
        };

        DialogueController.addDialogueMessage(quest.traderId, messageContent, sessionID, questRewards);

        const completeQuestResponse = ItemEventRouter.getOutput(sessionID);
        completeQuestResponse.profileChanges[sessionID].quests = QuestHelper.getDeltaQuests(beforeQuests, QuestController.getClientQuests(sessionID));
        QuestHelper.dumpQuests(completeQuestResponse.profileChanges[sessionID].quests);
        Object.assign(completeQuestResponse.profileChanges[sessionID].traderRelations, pmcData.TradersInfo);

        return completeQuestResponse;
    }

    static failQuest(pmcData, body, sessionID)
    {
        const questRewards = QuestController.applyQuestReward(pmcData, body, "Fail", sessionID);

        // Create a dialog message for completing the quest.
        const quest = QuestController.getQuestFromDb(body.qid);
        const failMessageId = QuestController.getQuestLocaleIdFromDb(quest.failMessageText);
        const messageContent = {
            "templateId": failMessageId,
            "type": DialogueController.getMessageTypeValue("questFail"),
            "maxStorageTime": QuestConfig.redeemTime * 3600
        };

        DialogueController.addDialogueMessage(quest.traderId, messageContent, sessionID, questRewards);

        const failedQuestResponse = ItemEventRouter.getOutput(sessionID);
        failedQuestResponse.profileChanges[sessionID].quests = QuestController.failedUnlocked(body.qid, sessionID);

        return failedQuestResponse;
    }

    static getQuestFromDb(questId)
    {
        let quest = DatabaseServer.tables.templates.quests[questId];
        if (!quest)
        {
            // Check for id in daily quests
            quest = DatabaseServer.tables.templates.dailyQuests.activeQuests.find(x => x._id === questId);
        }

        return quest;
    }

    static getQuestLocaleIdFromDb(messageId, localisation = "en")
    {
        const messageArray = messageId.split(" ");

        const locale = DatabaseServer.tables.locales.global[localisation];
        const questLocale = locale.quest[messageArray[0]];
        let localeId;
        if (questLocale)
        {
            localeId = questLocale[messageArray[1]];
        }
        else
        {
            // quest not found, check in dailies
            localeId = locale.repeatableQuest[messageId];
        }

        return localeId;
    }

    static handoverQuest(pmcData, body, sessionID)
    {
        const quest = QuestController.getQuestFromDb(body.qid);
        const types = ["HandoverItem", "WeaponAssembly"];
        const output = ItemEventRouter.getOutput(sessionID);
        let handoverMode = true;
        let value = 0;
        let counter = 0;
        let amount;

        for (const condition of quest.conditions.AvailableForFinish)
        {
            if (condition._props.id === body.conditionId && types.includes(condition._parent))
            {
                value = parseInt(condition._props.value);
                handoverMode = condition._parent === types[0];

                const profileCounter = (body.conditionId in pmcData.BackendCounters) ? pmcData.BackendCounters[body.conditionId].value : 0;
                value -= profileCounter;

                if (value <= 0)
                {
                    Logger.error(`Quest handover error: condition is already satisfied? qid=${body.qid}, condition=${body.conditionId}, profileCounter=${profileCounter}, value=${value}`);
                    return output;
                }

                break;
            }
        }

        if (handoverMode && value === 0)
        {
            Logger.error(`Quest handover error: condition not found or incorrect value. qid=${body.qid}, condition=${body.conditionId}`);
            return output;
        }

        for (const itemHandover of body.items)
        {
            // remove the right quantity of given items
            amount = Math.min(itemHandover.count, value - counter);
            counter += amount;
            if (itemHandover.count - amount > 0)
            {
                QuestController.changeItemStack(pmcData, itemHandover.id, itemHandover.count - amount, sessionID, output);
                if (counter === value)
                {
                    break;
                }
            }
            else
            {
                // for weapon handover quests, remove the item and its children.
                const toRemove = InventoryHelper.findAndReturnChildren(pmcData, itemHandover.id);
                let index = pmcData.Inventory.items.length;

                // important: don't tell the client to remove the attachments, it will handle it
                output.profileChanges[sessionID].items.del.push({ "_id": itemHandover.id });

                // important: loop backward when removing items from the array we're looping on
                while (index-- > 0)
                {
                    if (toRemove.includes(pmcData.Inventory.items[index]._id))
                    {
                        pmcData.Inventory.items.splice(index, 1);
                    }
                }
            }
        }

        if (pmcData.BackendCounters[body.conditionId] !== undefined)
        {
            pmcData.BackendCounters[body.conditionId].value += counter;
        }
        else
        {
            pmcData.BackendCounters[body.conditionId] = { "id": body.conditionId, "qid": body.qid, "value": counter };
        }

        return output;
    }

    static acceptedUnlocked(acceptedQuestId, sessionID)
    {
        const profile = ProfileController.getPmcProfile(sessionID);
        const quests = QuestController.questValues().filter((q) =>
        {
            const acceptedQuestCondition = q.conditions.AvailableForStart.find(
                c =>
                {
                    return c._parent === "Quest" && c._props.target === acceptedQuestId && c._props.status[0] === QuestHelper.status.Started;
                });

            if (!acceptedQuestCondition)
            {
                return false;
            }

            const profileQuest = profile.Quests.find(pq => pq.qid === acceptedQuestId);
            return profileQuest && (profileQuest.status === "Started" || profileQuest.status === "AvailableForFinish");
        });

        return QuestController.cleanQuestList(quests);
    }

    static failedUnlocked(failedQuestId, sessionID)
    {
        const profile = ProfileController.getPmcProfile(sessionID);
        const quests = QuestController.questValues().filter((q) =>
        {
            const acceptedQuestCondition = q.conditions.AvailableForStart.find(
                c =>
                {
                    return c._parent === "Quest" && c._props.target === failedQuestId && c._props.status[0] === QuestHelper.status.Fail;
                });

            if (!acceptedQuestCondition)
            {
                return false;
            }

            const profileQuest = profile.Quests.find(pq => pq.qid === failedQuestId);
            return profileQuest && (profileQuest.status === "Fail");
        });

        return QuestController.cleanQuestList(quests);
    }

    static applyMoneyBoost(quest, moneyBoost)
    {
        for (const reward of quest.rewards.Success)
        {
            if (reward.type === "Item")
            {
                if (PaymentController.isMoneyTpl(reward.items[0]._tpl))
                {
                    reward.items[0].upd.StackObjectsCount += Math.round(reward.items[0].upd.StackObjectsCount * moneyBoost / 100);
                }
            }
        }

        return quest;
    }

    /* Sets the item stack to value, or delete the item if value <= 0 */
    // TODO maybe merge this function and the one from customization
    static changeItemStack(pmcData, id, value, sessionID, output)
    {
        const inventoryItemIndex = pmcData.Inventory.items.findIndex(item => item._id === id);
        if (inventoryItemIndex < 0)
        {
            Logger.error(`changeItemStack: Item with _id = ${id} not found in inventory`);
            return;
        }

        if (value > 0)
        {
            const item = pmcData.Inventory.items[inventoryItemIndex];
            item.upd.StackObjectsCount = value;

            output.profileChanges[sessionID].items.change.push({
                "_id": item._id,
                "_tpl": item._tpl,
                "parentId": item.parentId,
                "slotId": item.slotId,
                "location": item.location,
                "upd": { "StackObjectsCount": item.upd.StackObjectsCount }
            });
        }
        else
        {
            // this case is probably dead Code right now, since the only calling function
            // checks explicitely for Value > 0.
            output.profileChanges[sessionID].items.del.push({ "_id": id });
            pmcData.Inventory.items.splice(inventoryItemIndex, 1);
        }
    }

    /**
     * Get List of All Quests as an array
     */
    static questValues()
    {
        return Object.values(DatabaseServer.tables.templates.quests);
    }

    /*
    * Quest status values
    * 0 - Locked
    * 1 - AvailableForStart
    * 2 - Started
    * 3 - AvailableForFinish
    * 4 - Success
    * 5 - Fail
    * 6 - FailRestartable
    * 7 - MarkedAsFailed
    */
    static questStatus(pmcData, questID)
    {
        for (const quest of pmcData.Quests)
        {
            if (quest.qid === questID)
            {
                return quest.status;
            }
        }

        return "Locked";
    }

    static cleanQuestList(quests)
    {
        for (const i in quests)
        {
            quests[i] = QuestController.cleanQuestConditions(quests[i]);
        }

        return quests;
    }

    static cleanQuestConditions(quest)
    {
        quest = JsonUtil.clone(quest);
        quest.conditions.AvailableForStart = quest.conditions.AvailableForStart.filter(q => q._parent === "Level");

        return quest;
    }

    static resetProfileQuestCondition(sessionID, conditionId)
    {
        const startedQuests = ProfileController.getPmcProfile(sessionID).Quests.filter(q => q.status === "Started");

        for (const quest of startedQuests)
        {
            const index = quest.completedConditions.indexOf(conditionId);

            if (index > -1)
            {
                quest.completedConditions.splice(index, 1);
            }
        }
    }
}

module.exports = QuestController;
