-- D-X50: username + password sign-in (Better Auth username plugin).
ALTER TABLE "User" ADD COLUMN "username" TEXT,
ADD COLUMN "displayUsername" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
