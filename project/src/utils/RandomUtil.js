"use strict";

require("../Lib.js");

class RandomUtil
{
    static getInt(min, max)
    {
        min = Math.ceil(min);
        max = Math.floor(max);
        return (max > min) ? Math.floor(Math.random() * (max - min + 1) + min) : min;
    }

    static getIntEx(max)
    {
        return (max > 1) ? Math.floor(Math.random() * (max - 2) + 1) : 1;
    }

    static getFloat(min, max)
    {
        return Math.random() * (max - min) + min;
    }

    static getBool()
    {
        return Math.random() < 0.5;
    }

    static getArrayValue(arr)
    {
        return arr[RandomUtil.getInt(0, arr.length - 1)];
    }

    static getKey(node)
    {
        return RandomUtil.getArrayValue(Object.keys(node));
    }

    static getKeyValue(node)
    {
        return node[RandomUtil.getKey(node)];
    }

    /**
     * Draw Random integer low inclusive, high exclusive
     * if high is not set we draw from 0 to low (exclusive)
     * @param   {integer}   low     Lower bound inclusive, when high is not set, this is high
     * @param   {integer}   high    Higher bound exclusive
     * @returns {integer}           The random integer in [low, high)
     */
    static RandInt(low, high)
    {
        if (high)
        {
            return low + Math.floor(Math.random() * (high - low));
        }
        else
        {
            return Math.floor(Math.random() * low);
        }
    }

    /**
     * Draw a random element of the provided list N times to return an array of N random elements
     * Drawing can be with or without replacement
     * @param   {array}     list            The array we want to draw randomly from
     * @param   {integer}   N               The number of times we want to draw
     * @param   {boolean}   replacement     Draw with ot without replacement from the input array
     * @return  {array}                     Array consisting of N random elements
     */
    static DrawRandomFromList(list, N = 1, replacement = true)
    {
        if (!replacement)
        {
            list = JsonUtil.clone(list);
        }

        const results = [];
        for (let i = 0; i < N; i++)
        {
            const randomIndex = RandomUtil.RandInt(list.length);
            if (replacement)
            {
                results.push(list[randomIndex]);
            }
            else
            {
                results.push(list.splice(randomIndex, 1)[0]);
            }
        }
        return results;
    }

    /**
     * Draw a random (top level) element of the provided dictionary N times to return an array of N random dictionary keys
     * Drawing can be with or without replacement
     * @param   {object}    dict            The dictionary we want to draw randomly from
     * @param   {integer}   N               The number of times we want to draw
     * @param   {boolean}   replacement     Draw with ot without replacement from the input dict
     * @return  {array}                     Array consisting of N random keys of the dictionary
     */
    static DrawRandomFromDict(dict, N = 1, replacement = true)
    {
        const keys = Object.keys(dict);
        const randomKeys = RandomUtil.DrawRandomFromList(keys, N, replacement);
        return randomKeys;
    }

    /**
     * Draw a random (top level) element of the provided dictionary N times to return an array of N random dictionary keys.
     * The function expects a dictionary with keys and their relative probability assigned.
     * (probabilities do not need to sum to 1, we normalize)
     * e.g.
     * dict = {"a": 5, "b": 1} leads to a higher probability of "a" being drawn
     *
     * Example:
     *   test = {"a": 5, "b": 1, "c": 1}
     *   res = RandomUtil.DrawFromDictByProb(test, 10000)
     *   // count the elements which should be distributed according to the dict values
     *   res.filter(x => x==="b").reduce((sum, x) => sum + 1 , 0)
     *
     * Drawing can be with or without replacement
     * @param   {object}    dict            The dictionary with key value pairs, where the value is a relative probability
     * @param   {integer}   N               The number of times we want to draw
     * @param   {boolean}   replacement     Draw with ot without replacement from the input dict
     * @return  {array}                     Array consisting of N random keys of the dictionary
     */
    static DrawFromDictByProb(dict, N = 1, replacement = true)
    {
        const dictArray = Object.entries(dict);

        function calculateProbCumsum(dictArray)
        {
            const probValues = dictArray.map(x => x[1]);
            const sum = MathUtil.arraySum(probValues);
            let probCumsum = MathUtil.arrayCumsum(probValues);
            probCumsum = MathUtil.arrayProd(probCumsum, 1 / sum);
            return probCumsum;
        }

        let probCumsum = calculateProbCumsum(dictArray);

        const randomKeys = [];
        for (let i = 0; i < N; i++)
        {
            const rand = Math.random();
            const idx = probCumsum.findIndex(x => x > rand);
            // we cannot put Math.random() directly in the findIndex because then it draws anew for each of its iteration
            if (replacement)
            {
                randomKeys.push(dictArray[idx][0]);
            }
            else
            {
                randomKeys.push(dictArray.splice(idx, 1)[0][0]);
                probCumsum = calculateProbCumsum(dictArray);
            }
        }
        return randomKeys;
    }

    /**
     * Get the minimum relative probability out of a "probability dictionary"
     *
     * Example:
     *  dict = {"a": 5, "b": 1}
     *  RandomUtil.probDictMin(dict) // returns 1
     *
     * @param   {object}     dict           The "probability dictionary"
     * @return  {number}                    the minimum value of the dict (which is the min. rel. probability)
     */
    static probDictMin(dict)
    {
        const dictArray = Object.entries(dict);
        return Math.min(...dictArray.map(x => x[1]));
    }

    /**
     * Get the maximum relative probability out of a "probability dictionary"
     *
     * Example:
     *  dict = {"a": 5, "b": 1}
     *  RandomUtil.probDictMax(dict) // returns 5
     *
     * @param   {object}    dict            The "probability dictionary"
     * @return  {number}                    the minimum value of the dict (which is the min. rel. probability)
     */
    static probDictMax(dict)
    {
        const dictArray = Object.entries(dict);
        return Math.max(...dictArray.map(x => x[1]));
    }
}

module.exports = RandomUtil;
