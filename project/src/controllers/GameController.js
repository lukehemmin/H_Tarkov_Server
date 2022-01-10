"use strict";

require("../Lib.js");

class GameController
{
    static gameStart(url, info, sessionID)
    {
        // we need to keep the completed dailies in a list in the profile since the client seems to keep them internally
        // so they always come back with the offraidData and would be inserted to the Quests list.
        // Since we don't want to clutter the Quests list, we need to remove all completed (failed / successful) dailies.
        // To keep a memory which dailies are completed we need the Dailies.Complete list. This list should be cleaned
        // when the client restarts. This could be the place to do it...
        if (sessionID)
        {

            const profile = ProfileController.getPmcProfile(sessionID);
            if (profile.Dailies)
            {
                profile.Dailies.Complete = [];
            }

            // remove dangling ConditionCounters
            if (profile.ConditionCounters)
            {
                profile.ConditionCounters.Counters = profile.ConditionCounters.Counters.filter(c => c.qid !== null);
            }

            // remove dangling BackendCounters
            if (profile.BackendCounters)
            {
                const countersToRemove = [];
                for (const [key, value] of Object.entries(profile.BackendCounters))
                {
                    const daily = profile.Dailies.Available.filter(q => q._id === value.qid);
                    const quest = profile.Quests.filter(q => q.qid === value.qid);
                    // if BackendCounter's quest is neither in Dailies.Available nor Quests it's stale
                    if (daily.length === 0 && quest.length === 0)
                    {
                        countersToRemove.push(key);
                    }
                }

                for (let i = 0; i < countersToRemove.length; i++)
                {
                    delete profile.BackendCounters[countersToRemove[i]];
                }
            }
        }
    }
}

module.exports = GameController;