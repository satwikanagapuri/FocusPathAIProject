const { verifyToken } = require("../lib/jwt");
const { chatAssistant } = require("../services/ai.service");

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    try {
      const decoded = verifyToken(token);
      socket.user = { id: decoded.sub, email: decoded.email };
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.user?.id) socket.join(socket.user.id);

    socket.on("chat:message", async (payload = {}) => {
      const { message, requestId, userContext, history } = payload;
      if (!message || typeof message !== "string") return;

      try {
        const response = await chatAssistant({
          userId: socket.user.id,
          message,
          userContext: userContext || {},
          history: Array.isArray(history) ? history : [],
        });

        io.to(socket.user.id).emit("chat:response", {
          requestId: requestId || null,
          response,
        });
      } catch (err) {
        console.error("[socket] chat:message error:", err?.message || err);
        io.to(socket.user.id).emit("chat:response", {
          requestId: requestId || null,
          response: "Sorry — something went wrong. Please try again.",
          error: true,
        });
      }
    });
  });
}

module.exports = { setupSocket };
