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
}

module.exports = RandomUtil;
