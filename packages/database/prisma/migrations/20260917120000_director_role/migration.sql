-- Роль директора: видит всё производство, ничего не меняет
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DIRECTOR';
