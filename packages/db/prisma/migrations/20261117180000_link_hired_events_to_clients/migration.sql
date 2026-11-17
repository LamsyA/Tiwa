-- D-X71: events whose host hired a planner on Tiwa belong to that planner's CRM client.
UPDATE "Event" e SET "clientId" = r."clientId"
FROM "QuoteRequest" r
JOIN "Quote" q ON q."requestId" = r."id" AND q."status" = 'ACCEPTED'
WHERE r."category" = 'planning' AND r."clientId" IS NOT NULL
  AND e."id" = r."eventId" AND e."clientId" IS NULL;
