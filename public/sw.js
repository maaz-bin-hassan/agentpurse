self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : { title: "AgentPurse", body: "A payment is waiting." };
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, data: { url: payload.url || "/" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
