var Global = require("../global.js");

function isPortOpen(projectID){
    console.log('isPortOpen() Servers=====,find '+projectID);
    console.log(Global.Servers);
    var foundMatch = 0;
    for(var i=0; i<Global.Servers.length; i++){
        if(Number(Global.Servers[i].projectID) === Number(projectID)){
            foundMatch++;
        }
    }
    console.log(foundMatch);
    if(foundMatch >0){
        return true;
    }else{
        return false;
    }
}

exports.getProjects = function (projectID, db, callBack) {
    db.serialize(function () {
        var result = [];
        var qSelectProject = '';
        if (projectID === 0) {
            qSelectProject = 'select * FROM projects ORDER BY ID DESC';
        } else {
            qSelectProject = 'select * FROM projects WHERE ID=' + projectID;
        }
        db.each(qSelectProject, function (err, row) {
            row.isProxyPortRunning = isPortOpen(row.ID);
            result.push(row);
        }, function complete() {
            return callBack(result);
        });
    });
};

exports.saveProject = function (postData, db, callBack) {
    db.serialize(function () {
        var queryP = '';
        if (Number(postData.projectID) === 0) {
            queryP = "INSERT INTO projects (Name,FolderPath) VALUES('" + postData.projectName + "','" + postData.projectFolder + "')";
        } else {
            queryP = "UPDATE projects SET Name='" + postData.projectName + "',FolderPath='" + postData.projectFolder + "' WHERE ID=" + postData.projectID;
        }
        console.log(queryP);
        db.run(queryP, function (error) {
            if (error !== null) {
                return callBack(error);
            } else {
                var projectID = 0;
                console.log('ajaxToProject.js (detail,changes)' + this.changes);
                console.log('ajaxToProject.js (detail,lastID)' + this.lastID);

                if (this.changes > 0) {
                    if (Number(postData.projectID) === 0) {
                        projectID = this.lastID;
                    } else {
                        projectID = Number(postData.projectID);
                    }

                    function insertIgnored(_projectID, _ignoredOnes, callBack) {
                        var countFileAdded = 0;
                        var countOperation = 0;
                        for (var i = 0; i < _ignoredOnes.length; i++) {
                            db.run("INSERT INTO ignoredFiles (ProjectID,FilePath) VALUES(" + _projectID + ",'" + _ignoredOnes[i] + "')", function (error) {
                                countOperation++;
                                if (this.changes > 0) {
                                    countFileAdded++;
                                }

                                if (countOperation === _ignoredOnes.length) {
                                    return callBack({affected: countFileAdded});
                                }
                            });
                        }
                    }

                    if (Number(postData.projectID) > 0) {
                        db.run('DELETE FROM ignoredFiles WHERE ProjectID=' + projectID, function (err) {
                            insertIgnored(projectID, postData.ignoredFiles, function (result) {
                                console.log('update, insertIgnored callback, ignored.length ' + result.affected);
                                if (result.affected == postData.ignoredFiles.length) {
                                    var result = {
                                        ID: projectID,
                                        name: postData.projectName,
                                        folderPath: postData.projectFolder,
                                        ignored: postData.ignoredFiles
                                    };
                                    return callBack(result);
                                } else {
                                    return callBack('Project is not saved. Not all ignroed files are added.');
                                }
                            });
                        });
                    } else {
                        insertIgnored(projectID, postData.ignoredFiles, function (result) {
                            if (result.affected == postData.ignoredFiles.length) {
                                var result = {
                                    ID: projectID,
                                    name: postData.projectName,
                                    folderPath: postData.projectFolder,
                                    ignored: postData.ignoredFiles
                                };
                                return callBack(result);
                            } else {
                                return callBack('Project is not saved. Not all ignroed files are added.');
                            }
                        });
                    }
                } else {
                    return callBack('Project is not saved. Project detail is not updated.');
                }



            }
        });
    });
};

exports.getProjectDetail = function (projectID, db, callBack) {
    console.log(projectID);
    db.serialize(function () {
        var result = {
            detail: null,
            ignored: []
        };
        db.each('SELECT * FROM projects WHERE ID=' + projectID, function (err, row) {
            row.isProxyPortRunning = isPortOpen(row.ID);
            console.log(row);
            result.detail = row;
        }, function complete() {
            db.each('SELECT * FROM ignoredFiles WHERE ProjectID=' + projectID, function (err, row) {
                result.ignored.push(row);
            }, function complete() {
                callBack(result);
            });
        });
    });
};