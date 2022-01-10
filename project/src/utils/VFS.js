"use strict";

require("../Lib.js");

const fs = require("fs");
const path = require("path");
const atomicW = require("atomically");
const lockfile = require("proper-lockfile");

class VFS
{
    static exists(filepath)
    {
        return fs.existsSync(filepath);
    }

    static rename(filepath, target)
    {
        fs.renameSync(filepath, target);
    }

    static copyFile(filepath, target)
    {
        fs.copyFileSync(filepath, target);
    }

    static createDir(filepath)
    {
        fs.mkdirSync(filepath.substr(0, filepath.lastIndexOf("/")), { "recursive": true });
    }

    static lockFileSync(filepath)
    {
        lockfile.lockSync(filepath);
    }

    static checkFileSync(filepath)
    {
        return lockfile.checkSync(filepath);
    }

    static unlockFileSync(filepath)
    {
        lockfile.unlockSync(filepath);
    }

    static copyDir(filepath, target)
    {
        const files = this.getFiles(filepath);
        const dirs = this.getDirs(filepath);

        if (!this.exists(target))
        {
            VFS.createDir(`${target}/`);
        }

        for (const dir of dirs)
        {
            VFS.copyDir(path.join(filepath, dir), path.join(target, dir));
        }

        for (const file of files)
        {
            VFS.copyFile(path.join(filepath, file), path.join(target, file));
        }
    }

    static readFile(filepath)
    {
        return fs.readFileSync(filepath);
    }

    static writeFile(filepath, data = "", append = false, atomic = true)
    {
        const options = (append) ? { "flag": "a" } : { "flag": "w" };

        if (!VFS.exists(filepath))
        {
            VFS.createDir(filepath);
            fs.writeFileSync(filepath, "");
        }

        VFS.lockFileSync(filepath);

        if (!append && atomic)
        {
            atomicW.writeFileSync(filepath, data);
        }
        else
        {
            fs.writeFileSync(filepath, data, options);
        }

        if (VFS.checkFileSync(filepath))
        {
            VFS.unlockFileSync(filepath);
        }
    }

    static getFiles(filepath)
    {
        return fs.readdirSync(filepath).filter((item) =>
        {
            return fs.statSync(path.join(filepath, item)).isFile();
        });
    }

    static getDirs(filepath)
    {
        return fs.readdirSync(filepath).filter((item) =>
        {
            return fs.statSync(path.join(filepath, item)).isDirectory();
        });
    }

    static removeFile(filepath)
    {
        fs.unlinkSync(filepath);
    }

    static removeDir(filepath)
    {
        const files = VFS.getFiles(filepath);
        const dirs = VFS.getDirs(filepath);

        for (const dir of dirs)
        {
            VFS.removeDir(path.join(filepath, dir));
        }

        for (const file of files)
        {
            VFS.removeFile(path.join(filepath, file));
        }

        fs.rmdirSync(filepath);
    }

    static explodePath(filepath)
    {
        return filepath.split("/");
    }

    static getFileExtension(filepath)
    {
        return filepath.split(".").pop();
    }

    static stripExtension(filepath)
    {
        return filepath.split(".").slice(0, -1).join(".");
    }
}

module.exports = VFS;
