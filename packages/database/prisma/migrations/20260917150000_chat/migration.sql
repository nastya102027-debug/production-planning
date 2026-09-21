-- Чат заказов: сообщения, вложения, упоминания, отметки прочтения
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatFile" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "stored" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMention" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    CONSTRAINT "ChatMention_pkey" PRIMARY KEY ("messageId","userId")
);

CREATE TABLE "ChatRead" (
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatRead_pkey" PRIMARY KEY ("userId","orderId")
);

CREATE UNIQUE INDEX "ChatMessage_seq_key" ON "ChatMessage"("seq");
CREATE INDEX "ChatMessage_orderId_seq_idx" ON "ChatMessage"("orderId", "seq");
CREATE UNIQUE INDEX "ChatFile_stored_key" ON "ChatFile"("stored");
CREATE INDEX "ChatFile_messageId_idx" ON "ChatFile"("messageId");
CREATE INDEX "ChatFile_createdAt_idx" ON "ChatFile"("createdAt");
CREATE INDEX "ChatMention_userId_seenAt_idx" ON "ChatMention"("userId", "seenAt");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatFile" ADD CONSTRAINT "ChatFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatFile" ADD CONSTRAINT "ChatFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
