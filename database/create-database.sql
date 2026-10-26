-- Run once as MySQL root in MySQL Workbench or the MySQL CLI.
-- Replace this sample local password here and in .env before use.
CREATE DATABASE IF NOT EXISTS campusflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'campusflow'@'localhost' IDENTIFIED BY 'change_this_local_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES ON campusflow.* TO 'campusflow'@'localhost';
