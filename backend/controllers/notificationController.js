const notificationService = require("../services/notificationService");

exports.list = async (req, res, next) => {
  try {
    res.json({ success: true, ...(await notificationService.listForUser(req.user.id)) });
  } catch (error) {
    next(error);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    res.json({
      success: true,
      notification: await notificationService.markRead(req.user.id, req.params.notificationId),
    });
  } catch (error) {
    next(error);
  }
};
