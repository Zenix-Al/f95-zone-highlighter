// Independent generic provider: editorial recommendation, not Library state.
module.exports = function createRecommendationProvider(broker) {
  const owner = "recommendation-addon";
  const id = "editor-pick";
  return {
    owner, id,
    register: () => broker.register(owner, { id, name: "Editor pick", description: "Editorial recommendations", priority: 0 }),
    respond(command) {
      return broker.respond(owner, { providerId: id, requestId: command.requestId,
        markers: Object.fromEntries(command.threadIds.filter((threadId) => threadId === "42").map((threadId) => [threadId, { label: "Editor pick", tone: "success", description: "Recommended by the editorial add-on" }])),
      });
    },
  };
};
