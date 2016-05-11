var models = require("../../../models");
var log = require('../../utils/logger');
var toJson = require('../../utils/to_json');
var async = require('async');
var _ = require('lodash');

var getModelAndUsersByType = function (model, userType, id, notification_setting_type, callback) {
  var userWhere = {};

  userWhere["notifications_settings."+notification_setting_type+".method"] = {
    $gt: 0
  };

  log.info("Notification Processing getModelAndUsersByType", { notification_setting_type: notification_setting_type, userWhere: userWhere });
  // TODO: Use streams when ready https://github.com/sequelize/sequelize/issues/2454
  model.find({
    where: { id: id },
    include: [
      {
        model: models.User,
        attributes: ['id','notifications_settings','email'],
        as: userType,
        where: userWhere
      }
    ]
  }).then( function(results) {
    log.info("Notification Processing found users", { numberOfUsers: results ? results.length : null, userWhere: userWhere });
    if (results) {
      callback(null, results)
    } else {
      callback();
    }
  }).catch(function(error) {
    callback(error);
  });
};

var addNotificationsForUsers = function (activity, users, notification_type, notification_setting_type, uniqueUserIds, callback) {
  async.eachSeries(users, function (user, seriesCallback) {
    if (_.includes(uniqueUserIds.users, user.id)) {
      seriesCallback();
    } else {
      models.AcNotification.createNotificationFromActivity(user, activity, notification_type, notification_setting_type, 50, function (error) {
        uniqueUserIds.users.push(user.id);
        seriesCallback(error);
      });
    }
  }, function (error) {
    callback(error);
  });
};

// type: 'notification.post.endorsement';
var addOrPossiblyGroupNotification = function (model, notification_type, notification_setting_type, activity, user, priority, callback) {
  models.AcNotification.find({
    where: {
      user_id: model.User.id,
      type: notification_type,
      created_at: {
        $lt: new Date(),
        $gt: new Date(new Date() - models.AcNotification.ENDORSEMENT_GROUPING_TTL)
      }
    }
  }).then(function(notification) {
    if (notification) {
      models.AcNotification.find({
        where: {
          user_id: user.id,
          type: notification_type,
          created_at: {
            $lt: new Date(),
            $gt: new Date(new Date() - models.AcNotification.ENDORSEMENT_GROUPING_TTL)
          }
        },
        include: [
          {
            model: models.AcActivity,
            as: 'AcActivities',
            required: true,
            where: {
              user_id: activity.user_id,
              type: activity.type
            }
          }
        ]
      }).then(function(specificNotification) {
        if (specificNotification) {
          callback();
        } else {
          notification.addAcActivities(activity).then(function (results) {
            if (results) {
              models.AcNotification.processNotification(notification, user, activity);
              callback();
            } else {
              callback("Notification Error Can't add activity");
            }
          });
        }
      });
    } else {
      models.AcNotification.createNotificationFromActivity(user, activity, notification_type, notification_setting_type, priority, function (error) {
        callback(error);
      });
    }
  });
};

module.exports = {
  getModelAndUsersByType: getModelAndUsersByType,
  addNotificationsForUsers: addNotificationsForUsers,
  addOrPossiblyGroupNotification: addOrPossiblyGroupNotification
};