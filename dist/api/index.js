import express, { Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import session, { Store } from 'express-session';
import 'dotenv/config';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as runtime2 from '@prisma/client/runtime/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaNeon } from '@prisma/adapter-neon';
import crypto from 'crypto';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { z, ZodError } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var config = {
  "previewFeatures": [],
  "clientVersion": "7.8.0",
  "engineVersion": "3c6e192761c0362d496ed980de936e2f3cebcd3a",
  "activeProvider": "postgresql",
  "inlineSchema": 'generator client {\n  provider = "prisma-client"\n  output   = "./generated/prisma"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\nenum Role {\n  SUPER_ADMIN\n  ADMIN\n  COMPANY\n  MARKETER\n  CUSTOMER\n}\n\nenum ApplicationStatus {\n  PENDING\n  APPROVED\n  REJECTED\n}\n\nenum InstallmentStatus {\n  PENDING\n  DUE\n  OVERDUE\n  DEFAULTED\n  PAID\n}\n\nenum PaymentStatus {\n  PENDING\n  SUCCESS\n  FAILED\n}\n\nenum CommissionStatus {\n  PENDING\n  APPROVED\n  PAID\n  FROZEN\n}\n\nenum TransactionType {\n  CREDIT\n  DEBIT\n}\n\nenum SubscriptionInterval {\n  WEEKLY\n  MONTHLY\n  YEARLY\n}\n\nenum SubscriptionStatus {\n  PENDING\n  ACTIVE\n  EXPIRED\n  CANCELLED\n}\n\nenum AccountType {\n  ASSET\n  LIABILITY\n  REVENUE\n  EXPENSE\n  EQUITY\n}\n\nmodel Company {\n  id        BigInt   @id @default(autoincrement())\n  companyId String   @unique @default(uuid())\n  name      String\n  plan      String   @default("FREE")\n  logoUrl   String?\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  users          User[]\n  products       Product[]\n  subscriptions  CompanySubscription[]\n  ledgerAccounts LedgerAccount[]\n}\n\nmodel User {\n  id                   BigInt   @id @default(autoincrement())\n  userId               String   @unique @default(uuid())\n  email                String   @unique\n  password             String\n  name                 String?\n  role                 Role     @default(CUSTOMER)\n  forcePasswordChange  Boolean  @default(false)\n  companyId            String?\n  company              Company? @relation(fields: [companyId], references: [companyId])\n  referredByMarketerId String?\n  referredByMarketer   User?    @relation("MarketerReferrals", fields: [referredByMarketerId], references: [userId])\n  referredUsers        User[]   @relation("MarketerReferrals")\n  createdAt            DateTime @default(now())\n  updatedAt            DateTime @updatedAt\n\n  sessions     UserSession[]\n  applications Application[]\n  installments Installment[]\n\n  referralCode   String?             @unique\n  referrals      Referral[]\n  commissions    Commission[]\n  transactions   LedgerTransaction[]\n  passwordResets PasswordReset[]\n}\n\nmodel UserSession {\n  id        BigInt   @id @default(autoincrement())\n  sessionId String   @unique @default(uuid()) @map("session_id")\n  userId    BigInt\n  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)\n  tokenHash String   @unique\n  createdAt DateTime @default(now())\n  expiresAt DateTime\n  revoked   Boolean  @default(false)\n}\n\nmodel PasswordReset {\n  id        BigInt   @id @default(autoincrement())\n  userId    BigInt\n  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)\n  otpHash   String   @map("otp_hash")\n  expiresAt DateTime\n  attempts  Int      @default(0)\n  used      Boolean  @default(false)\n  createdAt DateTime @default(now())\n}\n\nmodel Session {\n  id        String   @id\n  data      Json\n  expiresAt DateTime\n}\n\nmodel Category {\n  id          BigInt    @id @default(autoincrement())\n  categoryId  String    @unique @default(uuid())\n  name        String\n  slug        String    @unique\n  description String?\n  products    Product[]\n  createdAt   DateTime  @default(now())\n  updatedAt   DateTime  @updatedAt\n}\n\nmodel Product {\n  id             BigInt   @id @default(autoincrement())\n  productId      String   @unique @default(uuid())\n  companyId      String?\n  company        Company? @relation(fields: [companyId], references: [companyId])\n  name           String\n  slug           String   @unique\n  description    String?\n  minPrice       Decimal  @default(0)\n  maxPrice       Decimal  @default(0)\n  stockQuantity  Int      @default(0)\n  price          Decimal  @default(0)\n  commissionRate Decimal  @default(0)\n  active         Boolean  @default(true)\n  createdAt      DateTime @default(now())\n  updatedAt      DateTime @updatedAt\n\n  categoryId String?\n  category   Category? @relation(fields: [categoryId], references: [categoryId])\n\n  variants     ProductVariant[]\n  referrals    Referral[]\n  installments Installment[]\n}\n\nmodel ProductVariant {\n  id            BigInt   @id @default(autoincrement())\n  variantId     String   @unique @default(uuid())\n  productId     String\n  product       Product  @relation(fields: [productId], references: [productId])\n  sku           String   @unique\n  size          String?\n  color         String[] // PostgreSQL string array\n  images        String[] // PostgreSQL string array\n  stockQuantity Int      @default(0)\n  price         Decimal  @default(0)\n  createdAt     DateTime @default(now())\n  updatedAt     DateTime @updatedAt\n}\n\nmodel Application {\n  id            BigInt            @id @default(autoincrement())\n  applicationId String            @unique @default(uuid())\n  userId        String\n  user          User              @relation(fields: [userId], references: [userId])\n  status        ApplicationStatus @default(PENDING)\n  documentData  Json?\n  createdAt     DateTime          @default(now())\n  updatedAt     DateTime          @updatedAt\n}\n\nmodel Installment {\n  id            BigInt            @id @default(autoincrement())\n  installmentId String            @unique @default(uuid())\n  userId        String\n  user          User              @relation(fields: [userId], references: [userId])\n  productId     String\n  product       Product           @relation(fields: [productId], references: [productId])\n  amount        Decimal\n  dueDate       DateTime\n  status        InstallmentStatus @default(PENDING)\n  createdAt     DateTime          @default(now())\n  updatedAt     DateTime          @updatedAt\n\n  payments Payment[]\n}\n\nmodel Payment {\n  id             BigInt        @id @default(autoincrement())\n  paymentId      String        @unique @default(uuid())\n  installmentId  String\n  installment    Installment   @relation(fields: [installmentId], references: [installmentId])\n  amount         Decimal\n  status         PaymentStatus @default(PENDING)\n  gatewayRef     String?       @unique\n  idempotencyKey String?       @unique\n  webhookPayload Json?\n  createdAt      DateTime      @default(now())\n  updatedAt      DateTime      @updatedAt\n}\n\nmodel Commission {\n  id           BigInt           @id @default(autoincrement())\n  commissionId String           @unique @default(uuid())\n  userId       String // Marketer\n  user         User             @relation(fields: [userId], references: [userId])\n  paymentId    String? // Associated payment\n  amount       Decimal\n  status       CommissionStatus @default(PENDING)\n  createdAt    DateTime         @default(now())\n  updatedAt    DateTime         @updatedAt\n}\n\nmodel LedgerTransaction {\n  id            BigInt          @id @default(autoincrement())\n  transactionId String          @unique @default(uuid())\n  userId        String\n  user          User            @relation(fields: [userId], references: [userId])\n  type          TransactionType\n  amount        Decimal\n  referenceId   String? // Tied to paymentId, commissionId, etc.\n  description   String?\n  createdAt     DateTime        @default(now()) // Append only, no update!\n}\n\nmodel Referral {\n  id           BigInt   @id @default(autoincrement())\n  referralId   String   @unique @default(uuid())\n  marketerId   String\n  marketer     User     @relation(fields: [marketerId], references: [userId])\n  productId    String?\n  product      Product? @relation(fields: [productId], references: [productId])\n  referralCode String   @unique\n  createdAt    DateTime @default(now())\n}\n\nmodel SubscriptionPlan {\n  id                 BigInt               @id @default(autoincrement())\n  planId             String               @unique @default(uuid())\n  name               String               @unique\n  description        String?\n  price              Decimal\n  discountPrice      Decimal?\n  discountPercentage Decimal?\n  interval           SubscriptionInterval @default(MONTHLY)\n  active             Boolean              @default(true)\n  createdAt          DateTime             @default(now())\n  updatedAt          DateTime             @updatedAt\n\n  subscriptions     CompanySubscription[]\n  onboardingIntents OnboardingIntent[]\n}\n\nmodel CompanySubscription {\n  id             BigInt             @id @default(autoincrement())\n  subscriptionId String             @unique @default(uuid())\n  companyId      String\n  company        Company            @relation(fields: [companyId], references: [companyId])\n  planId         String\n  plan           SubscriptionPlan   @relation(fields: [planId], references: [planId])\n  status         SubscriptionStatus @default(PENDING)\n  startDate      DateTime?\n  endDate        DateTime?\n  createdAt      DateTime           @default(now())\n  updatedAt      DateTime           @updatedAt\n}\n\nmodel LedgerAccount {\n  id        BigInt      @id @default(autoincrement())\n  name      String // e.g., "PAYSTACK_CLEARING", "PLATFORM_REVENUE"\n  type      AccountType\n  balance   Decimal     @default(0)\n  companyId String? // Null for system-wide accounts\n  company   Company?    @relation(fields: [companyId], references: [companyId])\n  createdAt DateTime    @default(now())\n  updatedAt DateTime    @updatedAt\n\n  entries JournalEntry[]\n\n  @@unique([name, companyId])\n}\n\nmodel FinancialTransaction {\n  id          BigInt   @id @default(autoincrement())\n  reference   String   @unique // e.g., Paystack Ref, Payout ID\n  description String?\n  metadata    Json? // Store raw gateway response\n  createdAt   DateTime @default(now())\n\n  entries JournalEntry[]\n}\n\nmodel JournalEntry {\n  id              BigInt               @id @default(autoincrement())\n  transactionId   BigInt\n  transaction     FinancialTransaction @relation(fields: [transactionId], references: [id])\n  ledgerAccountId BigInt\n  account         LedgerAccount        @relation(fields: [ledgerAccountId], references: [id])\n  debit           Decimal              @default(0)\n  credit          Decimal              @default(0)\n  reference       String               @unique // Unique for this specific line\n  createdAt       DateTime             @default(now())\n}\n\nmodel WebhookEvent {\n  id        String   @id // External Event ID (e.g. Paystack event ID)\n  source    String // e.g., "PAYSTACK"\n  type      String // e.g., "charge.success"\n  payload   Json\n  processed Boolean  @default(false)\n  createdAt DateTime @default(now())\n\n  @@index([id])\n}\n\nmodel OnboardingIntent {\n  id       BigInt @id @default(autoincrement())\n  intentId String @unique @default(uuid())\n\n  email        String @unique\n  companyName  String\n  adminName    String\n  passwordHash String\n\n  planId String\n  plan   SubscriptionPlan @relation(fields: [planId], references: [planId])\n\n  paymentReference String? @unique\n\n  status OnboardingStatus @default(PENDING)\n\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  @@index([paymentReference])\n}\n\nenum OnboardingStatus {\n  PENDING\n  PAYMENT_INITIALIZED\n  PAID\n  COMPLETED\n  FAILED\n}\n',
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"Company":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"companyId","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"plan","kind":"scalar","type":"String"},{"name":"logoUrl","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"users","kind":"object","type":"User","relationName":"CompanyToUser"},{"name":"products","kind":"object","type":"Product","relationName":"CompanyToProduct"},{"name":"subscriptions","kind":"object","type":"CompanySubscription","relationName":"CompanyToCompanySubscription"},{"name":"ledgerAccounts","kind":"object","type":"LedgerAccount","relationName":"CompanyToLedgerAccount"}],"dbName":null},"User":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"userId","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"password","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"Role"},{"name":"forcePasswordChange","kind":"scalar","type":"Boolean"},{"name":"companyId","kind":"scalar","type":"String"},{"name":"company","kind":"object","type":"Company","relationName":"CompanyToUser"},{"name":"referredByMarketerId","kind":"scalar","type":"String"},{"name":"referredByMarketer","kind":"object","type":"User","relationName":"MarketerReferrals"},{"name":"referredUsers","kind":"object","type":"User","relationName":"MarketerReferrals"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"sessions","kind":"object","type":"UserSession","relationName":"UserToUserSession"},{"name":"applications","kind":"object","type":"Application","relationName":"ApplicationToUser"},{"name":"installments","kind":"object","type":"Installment","relationName":"InstallmentToUser"},{"name":"referralCode","kind":"scalar","type":"String"},{"name":"referrals","kind":"object","type":"Referral","relationName":"ReferralToUser"},{"name":"commissions","kind":"object","type":"Commission","relationName":"CommissionToUser"},{"name":"transactions","kind":"object","type":"LedgerTransaction","relationName":"LedgerTransactionToUser"},{"name":"passwordResets","kind":"object","type":"PasswordReset","relationName":"PasswordResetToUser"}],"dbName":null},"UserSession":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"sessionId","kind":"scalar","type":"String","dbName":"session_id"},{"name":"userId","kind":"scalar","type":"BigInt"},{"name":"user","kind":"object","type":"User","relationName":"UserToUserSession"},{"name":"tokenHash","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"revoked","kind":"scalar","type":"Boolean"}],"dbName":null},"PasswordReset":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"userId","kind":"scalar","type":"BigInt"},{"name":"user","kind":"object","type":"User","relationName":"PasswordResetToUser"},{"name":"otpHash","kind":"scalar","type":"String","dbName":"otp_hash"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"attempts","kind":"scalar","type":"Int"},{"name":"used","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null},"Session":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"data","kind":"scalar","type":"Json"},{"name":"expiresAt","kind":"scalar","type":"DateTime"}],"dbName":null},"Category":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"categoryId","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"slug","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"products","kind":"object","type":"Product","relationName":"CategoryToProduct"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"Product":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"productId","kind":"scalar","type":"String"},{"name":"companyId","kind":"scalar","type":"String"},{"name":"company","kind":"object","type":"Company","relationName":"CompanyToProduct"},{"name":"name","kind":"scalar","type":"String"},{"name":"slug","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"minPrice","kind":"scalar","type":"Decimal"},{"name":"maxPrice","kind":"scalar","type":"Decimal"},{"name":"stockQuantity","kind":"scalar","type":"Int"},{"name":"price","kind":"scalar","type":"Decimal"},{"name":"commissionRate","kind":"scalar","type":"Decimal"},{"name":"active","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"categoryId","kind":"scalar","type":"String"},{"name":"category","kind":"object","type":"Category","relationName":"CategoryToProduct"},{"name":"variants","kind":"object","type":"ProductVariant","relationName":"ProductToProductVariant"},{"name":"referrals","kind":"object","type":"Referral","relationName":"ProductToReferral"},{"name":"installments","kind":"object","type":"Installment","relationName":"InstallmentToProduct"}],"dbName":null},"ProductVariant":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"variantId","kind":"scalar","type":"String"},{"name":"productId","kind":"scalar","type":"String"},{"name":"product","kind":"object","type":"Product","relationName":"ProductToProductVariant"},{"name":"sku","kind":"scalar","type":"String"},{"name":"size","kind":"scalar","type":"String"},{"name":"color","kind":"scalar","type":"String"},{"name":"images","kind":"scalar","type":"String"},{"name":"stockQuantity","kind":"scalar","type":"Int"},{"name":"price","kind":"scalar","type":"Decimal"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"Application":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"applicationId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"ApplicationToUser"},{"name":"status","kind":"enum","type":"ApplicationStatus"},{"name":"documentData","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"Installment":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"installmentId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"InstallmentToUser"},{"name":"productId","kind":"scalar","type":"String"},{"name":"product","kind":"object","type":"Product","relationName":"InstallmentToProduct"},{"name":"amount","kind":"scalar","type":"Decimal"},{"name":"dueDate","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"InstallmentStatus"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"payments","kind":"object","type":"Payment","relationName":"InstallmentToPayment"}],"dbName":null},"Payment":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"paymentId","kind":"scalar","type":"String"},{"name":"installmentId","kind":"scalar","type":"String"},{"name":"installment","kind":"object","type":"Installment","relationName":"InstallmentToPayment"},{"name":"amount","kind":"scalar","type":"Decimal"},{"name":"status","kind":"enum","type":"PaymentStatus"},{"name":"gatewayRef","kind":"scalar","type":"String"},{"name":"idempotencyKey","kind":"scalar","type":"String"},{"name":"webhookPayload","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"Commission":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"commissionId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"CommissionToUser"},{"name":"paymentId","kind":"scalar","type":"String"},{"name":"amount","kind":"scalar","type":"Decimal"},{"name":"status","kind":"enum","type":"CommissionStatus"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"LedgerTransaction":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"transactionId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"LedgerTransactionToUser"},{"name":"type","kind":"enum","type":"TransactionType"},{"name":"amount","kind":"scalar","type":"Decimal"},{"name":"referenceId","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null},"Referral":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"referralId","kind":"scalar","type":"String"},{"name":"marketerId","kind":"scalar","type":"String"},{"name":"marketer","kind":"object","type":"User","relationName":"ReferralToUser"},{"name":"productId","kind":"scalar","type":"String"},{"name":"product","kind":"object","type":"Product","relationName":"ProductToReferral"},{"name":"referralCode","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null},"SubscriptionPlan":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"planId","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"price","kind":"scalar","type":"Decimal"},{"name":"discountPrice","kind":"scalar","type":"Decimal"},{"name":"discountPercentage","kind":"scalar","type":"Decimal"},{"name":"interval","kind":"enum","type":"SubscriptionInterval"},{"name":"active","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"subscriptions","kind":"object","type":"CompanySubscription","relationName":"CompanySubscriptionToSubscriptionPlan"},{"name":"onboardingIntents","kind":"object","type":"OnboardingIntent","relationName":"OnboardingIntentToSubscriptionPlan"}],"dbName":null},"CompanySubscription":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"subscriptionId","kind":"scalar","type":"String"},{"name":"companyId","kind":"scalar","type":"String"},{"name":"company","kind":"object","type":"Company","relationName":"CompanyToCompanySubscription"},{"name":"planId","kind":"scalar","type":"String"},{"name":"plan","kind":"object","type":"SubscriptionPlan","relationName":"CompanySubscriptionToSubscriptionPlan"},{"name":"status","kind":"enum","type":"SubscriptionStatus"},{"name":"startDate","kind":"scalar","type":"DateTime"},{"name":"endDate","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"LedgerAccount":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"name","kind":"scalar","type":"String"},{"name":"type","kind":"enum","type":"AccountType"},{"name":"balance","kind":"scalar","type":"Decimal"},{"name":"companyId","kind":"scalar","type":"String"},{"name":"company","kind":"object","type":"Company","relationName":"CompanyToLedgerAccount"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"entries","kind":"object","type":"JournalEntry","relationName":"JournalEntryToLedgerAccount"}],"dbName":null},"FinancialTransaction":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"reference","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"metadata","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"entries","kind":"object","type":"JournalEntry","relationName":"FinancialTransactionToJournalEntry"}],"dbName":null},"JournalEntry":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"transactionId","kind":"scalar","type":"BigInt"},{"name":"transaction","kind":"object","type":"FinancialTransaction","relationName":"FinancialTransactionToJournalEntry"},{"name":"ledgerAccountId","kind":"scalar","type":"BigInt"},{"name":"account","kind":"object","type":"LedgerAccount","relationName":"JournalEntryToLedgerAccount"},{"name":"debit","kind":"scalar","type":"Decimal"},{"name":"credit","kind":"scalar","type":"Decimal"},{"name":"reference","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null},"WebhookEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"source","kind":"scalar","type":"String"},{"name":"type","kind":"scalar","type":"String"},{"name":"payload","kind":"scalar","type":"Json"},{"name":"processed","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null},"OnboardingIntent":{"fields":[{"name":"id","kind":"scalar","type":"BigInt"},{"name":"intentId","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"companyName","kind":"scalar","type":"String"},{"name":"adminName","kind":"scalar","type":"String"},{"name":"passwordHash","kind":"scalar","type":"String"},{"name":"planId","kind":"scalar","type":"String"},{"name":"plan","kind":"object","type":"SubscriptionPlan","relationName":"OnboardingIntentToSubscriptionPlan"},{"name":"paymentReference","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"OnboardingStatus"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","company","referredByMarketer","referredUsers","user","sessions","applications","products","_count","category","product","variants","marketer","referrals","installments","installment","payments","commissions","transactions","passwordResets","users","subscriptions","plan","onboardingIntents","entries","transaction","account","ledgerAccounts","Company.findUnique","Company.findUniqueOrThrow","Company.findFirst","Company.findFirstOrThrow","Company.findMany","data","Company.createOne","Company.createMany","Company.createManyAndReturn","Company.updateOne","Company.updateMany","Company.updateManyAndReturn","create","update","Company.upsertOne","Company.deleteOne","Company.deleteMany","having","_avg","_sum","_min","_max","Company.groupBy","Company.aggregate","User.findUnique","User.findUniqueOrThrow","User.findFirst","User.findFirstOrThrow","User.findMany","User.createOne","User.createMany","User.createManyAndReturn","User.updateOne","User.updateMany","User.updateManyAndReturn","User.upsertOne","User.deleteOne","User.deleteMany","User.groupBy","User.aggregate","UserSession.findUnique","UserSession.findUniqueOrThrow","UserSession.findFirst","UserSession.findFirstOrThrow","UserSession.findMany","UserSession.createOne","UserSession.createMany","UserSession.createManyAndReturn","UserSession.updateOne","UserSession.updateMany","UserSession.updateManyAndReturn","UserSession.upsertOne","UserSession.deleteOne","UserSession.deleteMany","UserSession.groupBy","UserSession.aggregate","PasswordReset.findUnique","PasswordReset.findUniqueOrThrow","PasswordReset.findFirst","PasswordReset.findFirstOrThrow","PasswordReset.findMany","PasswordReset.createOne","PasswordReset.createMany","PasswordReset.createManyAndReturn","PasswordReset.updateOne","PasswordReset.updateMany","PasswordReset.updateManyAndReturn","PasswordReset.upsertOne","PasswordReset.deleteOne","PasswordReset.deleteMany","PasswordReset.groupBy","PasswordReset.aggregate","Session.findUnique","Session.findUniqueOrThrow","Session.findFirst","Session.findFirstOrThrow","Session.findMany","Session.createOne","Session.createMany","Session.createManyAndReturn","Session.updateOne","Session.updateMany","Session.updateManyAndReturn","Session.upsertOne","Session.deleteOne","Session.deleteMany","Session.groupBy","Session.aggregate","Category.findUnique","Category.findUniqueOrThrow","Category.findFirst","Category.findFirstOrThrow","Category.findMany","Category.createOne","Category.createMany","Category.createManyAndReturn","Category.updateOne","Category.updateMany","Category.updateManyAndReturn","Category.upsertOne","Category.deleteOne","Category.deleteMany","Category.groupBy","Category.aggregate","Product.findUnique","Product.findUniqueOrThrow","Product.findFirst","Product.findFirstOrThrow","Product.findMany","Product.createOne","Product.createMany","Product.createManyAndReturn","Product.updateOne","Product.updateMany","Product.updateManyAndReturn","Product.upsertOne","Product.deleteOne","Product.deleteMany","Product.groupBy","Product.aggregate","ProductVariant.findUnique","ProductVariant.findUniqueOrThrow","ProductVariant.findFirst","ProductVariant.findFirstOrThrow","ProductVariant.findMany","ProductVariant.createOne","ProductVariant.createMany","ProductVariant.createManyAndReturn","ProductVariant.updateOne","ProductVariant.updateMany","ProductVariant.updateManyAndReturn","ProductVariant.upsertOne","ProductVariant.deleteOne","ProductVariant.deleteMany","ProductVariant.groupBy","ProductVariant.aggregate","Application.findUnique","Application.findUniqueOrThrow","Application.findFirst","Application.findFirstOrThrow","Application.findMany","Application.createOne","Application.createMany","Application.createManyAndReturn","Application.updateOne","Application.updateMany","Application.updateManyAndReturn","Application.upsertOne","Application.deleteOne","Application.deleteMany","Application.groupBy","Application.aggregate","Installment.findUnique","Installment.findUniqueOrThrow","Installment.findFirst","Installment.findFirstOrThrow","Installment.findMany","Installment.createOne","Installment.createMany","Installment.createManyAndReturn","Installment.updateOne","Installment.updateMany","Installment.updateManyAndReturn","Installment.upsertOne","Installment.deleteOne","Installment.deleteMany","Installment.groupBy","Installment.aggregate","Payment.findUnique","Payment.findUniqueOrThrow","Payment.findFirst","Payment.findFirstOrThrow","Payment.findMany","Payment.createOne","Payment.createMany","Payment.createManyAndReturn","Payment.updateOne","Payment.updateMany","Payment.updateManyAndReturn","Payment.upsertOne","Payment.deleteOne","Payment.deleteMany","Payment.groupBy","Payment.aggregate","Commission.findUnique","Commission.findUniqueOrThrow","Commission.findFirst","Commission.findFirstOrThrow","Commission.findMany","Commission.createOne","Commission.createMany","Commission.createManyAndReturn","Commission.updateOne","Commission.updateMany","Commission.updateManyAndReturn","Commission.upsertOne","Commission.deleteOne","Commission.deleteMany","Commission.groupBy","Commission.aggregate","LedgerTransaction.findUnique","LedgerTransaction.findUniqueOrThrow","LedgerTransaction.findFirst","LedgerTransaction.findFirstOrThrow","LedgerTransaction.findMany","LedgerTransaction.createOne","LedgerTransaction.createMany","LedgerTransaction.createManyAndReturn","LedgerTransaction.updateOne","LedgerTransaction.updateMany","LedgerTransaction.updateManyAndReturn","LedgerTransaction.upsertOne","LedgerTransaction.deleteOne","LedgerTransaction.deleteMany","LedgerTransaction.groupBy","LedgerTransaction.aggregate","Referral.findUnique","Referral.findUniqueOrThrow","Referral.findFirst","Referral.findFirstOrThrow","Referral.findMany","Referral.createOne","Referral.createMany","Referral.createManyAndReturn","Referral.updateOne","Referral.updateMany","Referral.updateManyAndReturn","Referral.upsertOne","Referral.deleteOne","Referral.deleteMany","Referral.groupBy","Referral.aggregate","SubscriptionPlan.findUnique","SubscriptionPlan.findUniqueOrThrow","SubscriptionPlan.findFirst","SubscriptionPlan.findFirstOrThrow","SubscriptionPlan.findMany","SubscriptionPlan.createOne","SubscriptionPlan.createMany","SubscriptionPlan.createManyAndReturn","SubscriptionPlan.updateOne","SubscriptionPlan.updateMany","SubscriptionPlan.updateManyAndReturn","SubscriptionPlan.upsertOne","SubscriptionPlan.deleteOne","SubscriptionPlan.deleteMany","SubscriptionPlan.groupBy","SubscriptionPlan.aggregate","CompanySubscription.findUnique","CompanySubscription.findUniqueOrThrow","CompanySubscription.findFirst","CompanySubscription.findFirstOrThrow","CompanySubscription.findMany","CompanySubscription.createOne","CompanySubscription.createMany","CompanySubscription.createManyAndReturn","CompanySubscription.updateOne","CompanySubscription.updateMany","CompanySubscription.updateManyAndReturn","CompanySubscription.upsertOne","CompanySubscription.deleteOne","CompanySubscription.deleteMany","CompanySubscription.groupBy","CompanySubscription.aggregate","LedgerAccount.findUnique","LedgerAccount.findUniqueOrThrow","LedgerAccount.findFirst","LedgerAccount.findFirstOrThrow","LedgerAccount.findMany","LedgerAccount.createOne","LedgerAccount.createMany","LedgerAccount.createManyAndReturn","LedgerAccount.updateOne","LedgerAccount.updateMany","LedgerAccount.updateManyAndReturn","LedgerAccount.upsertOne","LedgerAccount.deleteOne","LedgerAccount.deleteMany","LedgerAccount.groupBy","LedgerAccount.aggregate","FinancialTransaction.findUnique","FinancialTransaction.findUniqueOrThrow","FinancialTransaction.findFirst","FinancialTransaction.findFirstOrThrow","FinancialTransaction.findMany","FinancialTransaction.createOne","FinancialTransaction.createMany","FinancialTransaction.createManyAndReturn","FinancialTransaction.updateOne","FinancialTransaction.updateMany","FinancialTransaction.updateManyAndReturn","FinancialTransaction.upsertOne","FinancialTransaction.deleteOne","FinancialTransaction.deleteMany","FinancialTransaction.groupBy","FinancialTransaction.aggregate","JournalEntry.findUnique","JournalEntry.findUniqueOrThrow","JournalEntry.findFirst","JournalEntry.findFirstOrThrow","JournalEntry.findMany","JournalEntry.createOne","JournalEntry.createMany","JournalEntry.createManyAndReturn","JournalEntry.updateOne","JournalEntry.updateMany","JournalEntry.updateManyAndReturn","JournalEntry.upsertOne","JournalEntry.deleteOne","JournalEntry.deleteMany","JournalEntry.groupBy","JournalEntry.aggregate","WebhookEvent.findUnique","WebhookEvent.findUniqueOrThrow","WebhookEvent.findFirst","WebhookEvent.findFirstOrThrow","WebhookEvent.findMany","WebhookEvent.createOne","WebhookEvent.createMany","WebhookEvent.createManyAndReturn","WebhookEvent.updateOne","WebhookEvent.updateMany","WebhookEvent.updateManyAndReturn","WebhookEvent.upsertOne","WebhookEvent.deleteOne","WebhookEvent.deleteMany","WebhookEvent.groupBy","WebhookEvent.aggregate","OnboardingIntent.findUnique","OnboardingIntent.findUniqueOrThrow","OnboardingIntent.findFirst","OnboardingIntent.findFirstOrThrow","OnboardingIntent.findMany","OnboardingIntent.createOne","OnboardingIntent.createMany","OnboardingIntent.createManyAndReturn","OnboardingIntent.updateOne","OnboardingIntent.updateMany","OnboardingIntent.updateManyAndReturn","OnboardingIntent.upsertOne","OnboardingIntent.deleteOne","OnboardingIntent.deleteMany","OnboardingIntent.groupBy","OnboardingIntent.aggregate","AND","OR","NOT","id","intentId","email","companyName","adminName","passwordHash","planId","paymentReference","OnboardingStatus","status","createdAt","updatedAt","equals","in","notIn","lt","lte","gt","gte","not","contains","startsWith","endsWith","source","type","payload","processed","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","array_contains","transactionId","ledgerAccountId","debit","credit","reference","description","metadata","every","some","none","name","AccountType","balance","companyId","subscriptionId","SubscriptionStatus","startDate","endDate","price","discountPrice","discountPercentage","SubscriptionInterval","interval","active","referralId","marketerId","productId","referralCode","userId","TransactionType","amount","referenceId","commissionId","paymentId","CommissionStatus","installmentId","PaymentStatus","gatewayRef","idempotencyKey","webhookPayload","dueDate","InstallmentStatus","applicationId","ApplicationStatus","documentData","variantId","sku","size","color","images","stockQuantity","has","hasEvery","hasSome","slug","minPrice","maxPrice","commissionRate","categoryId","expiresAt","otpHash","attempts","used","sessionId","tokenHash","revoked","password","Role","role","forcePasswordChange","referredByMarketerId","logoUrl","name_companyId","is","isNot","connectOrCreate","upsert","createMany","set","disconnect","delete","connect","updateMany","deleteMany","increment","decrement","multiply","divide","push"]'),
  graph: "swrXAdACDgkAAKgFACAWAADaBQAgFwAAigUAIBgBAOQEACEdAADbBQAg9gIAANkFADD3AgAABwAQ-AIAANkFADD5AgQAAAABgwNAAOcEACGEA0AA5wQAIaQDAQDkBAAhpwMBAAAAAeEDAQDxBAAhAQAAAAEAIBkDAAC4BQAgBAAA3gUAIAUAANoFACAHAADfBQAgCAAA4AUAIA8AANEFACAQAADSBQAgEwAA4QUAIBQAAOIFACAVAADjBQAg9gIAANwFADD3AgAAAwAQ-AIAANwFADD5AgQA8AQAIfsCAQDkBAAhgwNAAOcEACGEA0AA5wQAIaQDAQDxBAAhpwMBAPEEACG1AwEA8QQAIbYDAQDkBAAh3AMBAOQEACHeAwAA3QXeAyLfAyAA5gQAIeADAQDxBAAhDgMAAKcJACAEAACpCQAgBQAAowkAIAcAALEJACAIAACyCQAgDwAArgkAIBAAAK8JACATAACzCQAgFAAAtAkAIBUAALUJACCkAwAA5AUAIKcDAADkBQAgtQMAAOQFACDgAwAA5AUAIBkDAAC4BQAgBAAA3gUAIAUAANoFACAHAADfBQAgCAAA4AUAIA8AANEFACAQAADSBQAgEwAA4QUAIBQAAOIFACAVAADjBQAg9gIAANwFADD3AgAAAwAQ-AIAANwFADD5AgQAAAAB-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-QIEAPAEACGCAwAAyAW_AyKDA0AA5wQAIYQDQADnBAAhuAMQAIcFACG7AwEA5AQAIb0DAQDkBAAhvwMBAPEEACHAAwEA8QQAIcEDAADyBAAgBBEAAKoJACC_AwAA5AUAIMADAADkBQAgwQMAAOQFACAOEQAAyQUAIPYCAADHBQAw9wIAACwAEPgCAADHBQAw-QIEAAAAAYIDAADIBb8DIoMDQADnBAAhhANAAOcEACG4AxAAhwUAIbsDAQAAAAG9AwEA5AQAIb8DAQAAAAHAAwEAAAABwQMAAPIEACADAAAALAAgAQAALQAwAgAALgAgAQAAACwAIAMAAAAjACABAAAkADACAAAlACAMBgAAwgUAIPYCAADFBQAw9wIAADIAEPgCAADFBQAw-QIEAPAEACGCAwAAxgW9AyKDA0AA5wQAIYQDQADnBAAhtgMBAOQEACG4AxAAhwUAIboDAQDkBAAhuwMBAPEEACECBgAAqQkAILsDAADkBQAgDAYAAMIFACD2AgAAxQUAMPcCAAAyABD4AgAAxQUAMPkCBAAAAAGCAwAAxgW9AyKDA0AA5wQAIYQDQADnBAAhtgMBAOQEACG4AxAAhwUAIboDAQAAAAG7AwEA8QQAIQMAAAAyACABAAAzADACAAA0ACAMBgAAwgUAIPYCAADDBQAw9wIAADYAEPgCAADDBQAw-QIEAPAEACGDA0AA5wQAIZEDAADEBbgDIpoDAQDkBAAhnwMBAPEEACG2AwEA5AQAIbgDEACHBQAhuQMBAPEEACEDBgAAqQkAIJ8DAADkBQAguQMAAOQFACAMBgAAwgUAIPYCAADDBQAw9wIAADYAEPgCAADDBQAw-QIEAAAAAYMDQADnBAAhkQMAAMQFuAMimgMBAAAAAZ8DAQDxBAAhtgMBAOQEACG4AxAAhwUAIbkDAQDxBAAhAwAAADYAIAEAADcAMAIAADgAIAsGAADCBQAg9gIAAMAFADD3AgAAOgAQ-AIAAMAFADD5AgQA8AQAIYMDQADnBAAhtgMEAPAEACHVA0AA5wQAIdYDAQDkBAAh1wMCAMEFACHYAyAA5gQAIQEGAACpCQAgCwYAAMIFACD2AgAAwAUAMPcCAAA6ABD4AgAAwAUAMPkCBAAAAAGDA0AA5wQAIbYDBADwBAAh1QNAAOcEACHWAwEA5AQAIdcDAgDBBQAh2AMgAOYEACEDAAAAOgAgAQAAOwAwAgAAPAAgAQAAAAMAIAEAAAALACABAAAADwAgAQAAABMAIAEAAAAjACABAAAAMgAgAQAAADYAIAEAAAA6ACADAAAAGgAgAQAAGwAwAgAAHAAgDgMAAL8FACAYAAC7BQAg9gIAALwFADD3AgAARwAQ-AIAALwFADD5AgQA8AQAIf8CAQDkBAAhggMAAL0FqgMigwNAAOcEACGEA0AA5wQAIacDAQDkBAAhqAMBAOQEACGqA0AAvgUAIasDQAC-BQAhBAMAAKcJACAYAACoCQAgqgMAAOQFACCrAwAA5AUAIA4DAAC_BQAgGAAAuwUAIPYCAAC8BQAw9wIAAEcAEPgCAAC8BQAw-QIEAAAAAf8CAQDkBAAhggMAAL0FqgMigwNAAOcEACGEA0AA5wQAIacDAQDkBAAhqAMBAAAAAaoDQAC-BQAhqwNAAL4FACEDAAAARwAgAQAASAAwAgAASQAgAwAAAEcAIAEAAEgAMAIAAEkAIA8YAAC7BQAg9gIAALkFADD3AgAATAAQ-AIAALkFADD5AgQA8AQAIfoCAQDkBAAh-wIBAOQEACH8AgEA5AQAIf0CAQDkBAAh_gIBAOQEACH_AgEA5AQAIYADAQDxBAAhggMAALoFggMigwNAAOcEACGEA0AA5wQAIQIYAACoCQAggAMAAOQFACAPGAAAuwUAIPYCAAC5BQAw9wIAAEwAEPgCAAC5BQAw-QIEAAAAAfoCAQAAAAH7AgEAAAAB_AIBAOQEACH9AgEA5AQAIf4CAQDkBAAh_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-wcAIDAAAPwHACAxAAD_BwAgMgAA_gcAIDMAAP0HACCkAwAA5AUAIKcDAADkBQAgtQMAAOQFACDgAwAA5AUAIA_2AgAArQUAMPcCAACPAQAQ-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_5AgQAAAABgwNAAAAAAYQDQAAAAAGfAwEAAAABpAMBAAAAAacDAQAAAAGsAxAAAAABsQMgAAAAAbQDAQAAAAHMAwIAAAAB0AMBAAAAAdEDEAAAAAHSAxAAAAAB0wMQAAAAAdQDAQAAAAEBIwAA9gEAMAEjAAD2AQAwAQAAAAcAIAEAAAAYACAUAwAAqAcAIAsAAKkHACANAACqBwAgDwAAqwcAIBAAAKwHACD5AgQA6gUAIYMDQADuBQAhhANAAO4FACGfAwEA7AUAIaQDAQDrBQAhpwMBAOwFACGsAxAA-gUAIbEDIAD0BQAhtAMBAOsFACHMAwIAngcAIdADAQDrBQAh0QMQAPoFACHSAxAA-gUAIdMDEAD6BQAh1AMBAOwFACECAAAAHAAgIwAA-wEAIA_5AgQA6gUAIYMDQADuBQAhhANAAO4FACGfAwEA7AUAIaQDAQDrBQAhpwMBAOwFACGsAxAA-gUAIbEDIAD0BQAhtAMBAOsFACHMAwIAngcAIdADAQDrBQAh0QMQAPoFACHSAxAA-gUAIdMDEAD6BQAh1AMBAOwFACECAAAAGgAgIwAA_QEAIAIAAAAaACAjAAD9AQAgAQAAAAcAIAEAAAAYACADAAAAHAAgKgAA9AEAICsAAPsBACABAAAAHAAgAQAAABoAIAgKAACjBwAgMAAApAcAIDEAAKcHACAyAACmBwAgMwAApQcAIJ8DAADkBQAgpwMAAOQFACDUAwAA5AUAIBL2AgAApQUAMPcCAACGAgAQ-AIAAKUFADD5AgQAywQAIYMDQADPBAAhhANAAM8EACGfAwEAzQQAIaQDAQDMBAAhpwMBAM0EACGsAxAA6QQAIbEDIADfBAAhtAMBAMwEACHMAwIAowUAIdADAQDMBAAh0QMQAOkEACHSAxAA6QQAIdMDEADpBAAh1AMBAM0EACEDAAAAGgAgAQAAhQIAMC8AAIYCACADAAAAGgAgAQAAGwAwAgAAHAAgAQAAACEAIAEAAAAhACADAAAAHwAgAQAAIAAwAgAAIQAgAwAAAB8AIAEAACAAMAIAACEAIAMAAAAfACABAAAgADACAAAhACAMDAAAogcAIPkCBAAAAAGDA0AAAAABhANAAAAAAawDEAAAAAG0AwEAAAABxwMBAAAAAcgDAQAAAAHJAwEAAAABygMAAKAHACDLAwAAoQcAIMwDAgAAAAEBIwAAjgIAIAv5AgQAAAABgwNAAAAAAYQDQAAAAAGsAxAAAAABtAMBAAAAAccDAQAAAAHIAwEAAAAByQMBAAAAAcoDAACgBwAgywMAAKEHACDMAwIAAAABASMAAJACADABIwAAkAIAMAwMAACfBwAg-QIEAOoFACGDA0AA7gUAIYQDQADuBQAhrAMQAPoFACG0AwEA6wUAIccDAQDrBQAhyAMBAOsFACHJAwEA7AUAIcoDAACcBwAgywMAAJ0HACDMAwIAngcAIQIAAAAhACAjAACTAgAgC_kCBADqBQAhgwNAAO4FACGEA0AA7gUAIawDEAD6BQAhtAMBAOsFACHHAwEA6wUAIcgDAQDrBQAhyQMBAOwFACHKAwAAnAcAIMsDAACdBwAgzAMCAJ4HACECAAAAHwAgIwAAlQIAIAIAAAAfACAjAACVAgAgAwAAACEAICoAAI4CACArAACTAgAgAQAAACEAIAEAAAAfACAGCgAAlwcAIDAAAJgHACAxAACbBwAgMgAAmgcAIDMAAJkHACDJAwAA5AUAIA72AgAAoQUAMPcCAACcAgAQ-AIAAKEFADD5AgQAywQAIYMDQADPBAAhhANAAM8EACGsAxAA6QQAIbQDAQDMBAAhxwMBAMwEACHIAwEAzAQAIckDAQDNBAAhygMAAKIFACDLAwAAogUAIMwDAgCjBQAhAwAAAB8AIAEAAJsCADAvAACcAgAgAwAAAB8AIAEAACAAMAIAACEAIAEAAAARACABAAAAEQAgAwAAAA8AIAEAABAAMAIAABEAIAMAAAAPACABAAAQADACAAARACADAAAADwAgAQAAEAAwAgAAEQAgCAYAAJYHACD5AgQAAAABggMAAADGAwKDA0AAAAABhANAAAAAAbYDAQAAAAHEAwEAAAABxgOAAAAAAQEjAACkAgAgB_kCBAAAAAGCAwAAAMYDAoMDQAAAAAGEA0AAAAABtgMBAAAAAcQDAQAAAAHGA4AAAAABASMAAKYCADABIwAApgIAMAgGAACVBwAg-QIEAOoFACGCAwAAlAfGAyKDA0AA7gUAIYQDQADuBQAhtgMBAOsFACHEAwEA6wUAIcYDgAAAAAECAAAAEQAgIwAAqQIAIAf5AgQA6gUAIYIDAACUB8YDIoMDQADuBQAhhANAAO4FACG2AwEA6wUAIcQDAQDrBQAhxgOAAAAAAQIAAAAPACAjAACrAgAgAgAAAA8AICMAAKsCACADAAAAEQAgKgAApAIAICsAAKkCACABAAAAEQAgAQAAAA8AIAYKAACPBwAgMAAAkAcAIDEAAJMHACAyAACSBwAgMwAAkQcAIMYDAADkBQAgCvYCAACdBQAw9wIAALICABD4AgAAnQUAMPkCBADLBAAhggMAAJ4FxgMigwNAAM8EACGEA0AAzwQAIbYDAQDMBAAhxAMBAMwEACHGAwAA7QQAIAMAAAAPACABAACxAgAwLwAAsgIAIAMAAAAPACABAAAQADACAAARACABAAAAFQAgAQAAABUAIAMAAAATACABAAAUADACAAAVACADAAAAEwAgAQAAFAAwAgAAFQAgAwAAABMAIAEAABQAMAIAABUAIAwGAACMBwAgDAAAjQcAIBIAAI4HACD5AgQAAAABggMAAADEAwKDA0AAAAABhANAAAAAAbQDAQAAAAG2AwEAAAABuAMQAAAAAb0DAQAAAAHCA0AAAAABASMAALoCACAJ-QIEAAAAAYIDAAAAxAMCgwNAAAAAAYQDQAAAAAG0AwEAAAABtgMBAAAAAbgDEAAAAAG9AwEAAAABwgNAAAAAAQEjAAC8AgAwASMAALwCADAMBgAA_QYAIAwAAP4GACASAAD_BgAg-QIEAOoFACGCAwAA_AbEAyKDA0AA7gUAIYQDQADuBQAhtAMBAOsFACG2AwEA6wUAIbgDEAD6BQAhvQMBAOsFACHCA0AA7gUAIQIAAAAVACAjAAC_AgAgCfkCBADqBQAhggMAAPwGxAMigwNAAO4FACGEA0AA7gUAIbQDAQDrBQAhtgMBAOsFACG4AxAA-gUAIb0DAQDrBQAhwgNAAO4FACECAAAAEwAgIwAAwQIAIAIAAAATACAjAADBAgAgAwAAABUAICoAALoCACArAAC_AgAgAQAAABUAIAEAAAATACAFCgAA9wYAIDAAAPgGACAxAAD7BgAgMgAA-gYAIDMAAPkGACAM9gIAAJkFADD3AgAAyAIAEPgCAACZBQAw-QIEAMsEACGCAwAAmgXEAyKDA0AAzwQAIYQDQADPBAAhtAMBAMwEACG2AwEAzAQAIbgDEADpBAAhvQMBAMwEACHCA0AAzwQAIQMAAAATACABAADHAgAwLwAAyAIAIAMAAAATACABAAAUADACAAAVACABAAAALgAgAQAAAC4AIAMAAAAsACABAAAtADACAAAuACADAAAALAAgAQAALQAwAgAALgAgAwAAACwAIAEAAC0AMAIAAC4AIAsRAAD2BgAg-QIEAAAAAYIDAAAAvwMCgwNAAAAAAYQDQAAAAAG4AxAAAAABuwMBAAAAAb0DAQAAAAG_AwEAAAABwAMBAAAAAcEDgAAAAAEBIwAA0AIAIAr5AgQAAAABggMAAAC_AwKDA0AAAAABhANAAAAAAbgDEAAAAAG7AwEAAAABvQMBAAAAAb8DAQAAAAHAAwEAAAABwQOAAAAAAQEjAADSAgAwASMAANICADALEQAA9QYAIPkCBADqBQAhggMAAPQGvwMigwNAAO4FACGEA0AA7gUAIbgDEAD6BQAhuwMBAOsFACG9AwEA6wUAIb8DAQDsBQAhwAMBAOwFACHBA4AAAAABAgAAAC4AICMAANUCACAK-QIEAOoFACGCAwAA9Aa_AyKDA0AA7gUAIYQDQADuBQAhuAMQAPoFACG7AwEA6wUAIb0DAQDrBQAhvwMBAOwFACHAAwEA7AUAIcEDgAAAAAECAAAALAAgIwAA1wIAIAIAAAAsACAjAADXAgAgAwAAAC4AICoAANACACArAADVAgAgAQAAAC4AIAEAAAAsACAICgAA7wYAIDAAAPAGACAxAADzBgAgMgAA8gYAIDMAAPEGACC_AwAA5AUAIMADAADkBQAgwQMAAOQFACAN9gIAAJUFADD3AgAA3gIAEPgCAACVBQAw-QIEAMsEACGCAwAAlgW_AyKDA0AAzwQAIYQDQADPBAAhuAMQAOkEACG7AwEAzAQAIb0DAQDMBAAhvwMBAM0EACHAAwEAzQQAIcEDAADtBAAgAwAAACwAIAEAAN0CADAvAADeAgAgAwAAACwAIAEAAC0AMAIAAC4AIAEAAAA0ACABAAAANAAgAwAAADIAIAEAADMAMAIAADQAIAMAAAAyACABAAAzADACAAA0ACADAAAAMgAgAQAAMwAwAgAANAAgCQYAAO4GACD5AgQAAAABggMAAAC9AwKDA0AAAAABhANAAAAAAbYDAQAAAAG4AxAAAAABugMBAAAAAbsDAQAAAAEBIwAA5gIAIAj5AgQAAAABggMAAAC9AwKDA0AAAAABhANAAAAAAbYDAQAAAAG4AxAAAAABugMBAAAAAbsDAQAAAAEBIwAA6AIAMAEjAADoAgAwCQYAAO0GACD5AgQA6gUAIYIDAADsBr0DIoMDQADuBQAhhANAAO4FACG2AwEA6wUAIbgDEAD6BQAhugMBAOsFACG7AwEA7AUAIQIAAAA0ACAjAADrAgAgCPkCBADqBQAhggMAAOwGvQMigwNAAO4FACGEA0AA7gUAIbYDAQDrBQAhuAMQAPoFACG6AwEA6wUAIbsDAQDsBQAhAgAAADIAICMAAO0CACACAAAAMgAgIwAA7QIAIAMAAAA0ACAqAADmAgAgKwAA6wIAIAEAAAA0ACABAAAAMgAgBgoAAOcGACAwAADoBgAgMQAA6wYAIDIAAOoGACAzAADpBgAguwMAAOQFACAL9gIAAJEFADD3AgAA9AIAEPgCAACRBQAw-QIEAMsEACGCAwAAkgW9AyKDA0AAzwQAIYQDQADPBAAhtgMBAMwEACG4AxAA6QQAIboDAQDMBAAhuwMBAM0EACEDAAAAMgAgAQAA8wIAMC8AAPQCACADAAAAMgAgAQAAMwAwAgAANAAgAQAAADgAIAEAAAA4ACADAAAANgAgAQAANwAwAgAAOAAgAwAAADYAIAEAADcAMAIAADgAIAMAAAA2ACABAAA3ADACAAA4ACAJBgAA5gYAIPkCBAAAAAGDA0AAAAABkQMAAAC4AwKaAwEAAAABnwMBAAAAAbYDAQAAAAG4AxAAAAABuQMBAAAAAQEjAAD8AgAgCPkCBAAAAAGDA0AAAAABkQMAAAC4AwKaAwEAAAABnwMBAAAAAbYDAQAAAAG4AxAAAAABuQMBAAAAAQEjAAD-AgAwASMAAP4CADAJBgAA5QYAIPkCBADqBQAhgwNAAO4FACGRAwAA5Aa4AyKaAwEA6wUAIZ8DAQDsBQAhtgMBAOsFACG4AxAA-gUAIbkDAQDsBQAhAgAAADgAICMAAIEDACAI-QIEAOoFACGDA0AA7gUAIZEDAADkBrgDIpoDAQDrBQAhnwMBAOwFACG2AwEA6wUAIbgDEAD6BQAhuQMBAOwFACECAAAANgAgIwAAgwMAIAIAAAA2ACAjAACDAwAgAwAAADgAICoAAPwCACArAACBAwAgAQAAADgAIAEAAAA2ACAHCgAA3wYAIDAAAOAGACAxAADjBgAgMgAA4gYAIDMAAOEGACCfAwAA5AUAILkDAADkBQAgC_YCAACNBQAw9wIAAIoDABD4AgAAjQUAMPkCBADLBAAhgwNAAM8EACGRAwAAjgW4AyKaAwEAzAQAIZ8DAQDNBAAhtgMBAMwEACG4AxAA6QQAIbkDAQDNBAAhAwAAADYAIAEAAIkDADAvAACKAwAgAwAAADYAIAEAADcAMAIAADgAIAEAAAAlACABAAAAJQAgAwAAACMAIAEAACQAMAIAACUAIAMAAAAjACABAAAkADACAAAlACADAAAAIwAgAQAAJAAwAgAAJQAgCAwAAN4GACAOAADdBgAg-QIEAAAAAYMDQAAAAAGyAwEAAAABswMBAAAAAbQDAQAAAAG1AwEAAAABASMAAJIDACAG-QIEAAAAAYMDQAAAAAGyAwEAAAABswMBAAAAAbQDAQAAAAG1AwEAAAABASMAAJQDADABIwAAlAMAMAEAAAAaACAIDAAA3AYAIA4AANsGACD5AgQA6gUAIYMDQADuBQAhsgMBAOsFACGzAwEA6wUAIbQDAQDsBQAhtQMBAOsFACECAAAAJQAgIwAAmAMAIAb5AgQA6gUAIYMDQADuBQAhsgMBAOsFACGzAwEA6wUAIbQDAQDsBQAhtQMBAOsFACECAAAAIwAgIwAAmgMAIAIAAAAjACAjAACaAwAgAQAAABoAIAMAAAAlACAqAACSAwAgKwAAmAMAIAEAAAAlACABAAAAIwAgBgoAANYGACAwAADXBgAgMQAA2gYAIDIAANkGACAzAADYBgAgtAMAAOQFACAJ9gIAAIwFADD3AgAAogMAEPgCAACMBQAw-QIEAMsEACGDA0AAzwQAIbIDAQDMBAAhswMBAMwEACG0AwEAzQQAIbUDAQDMBAAhAwAAACMAIAEAAKEDADAvAACiAwAgAwAAACMAIAEAACQAMAIAACUAIBAXAACKBQAgGQAAiwUAIPYCAACGBQAw9wIAAKgDABD4AgAAhgUAMPkCBAAAAAH_AgEAAAABgwNAAOcEACGEA0AA5wQAIZ8DAQDxBAAhpAMBAAAAAawDEACHBQAhrQMQAIgFACGuAxAAiAUAIbADAACJBbADIrEDIADmBAAhAQAAAKUDACABAAAApQMAIBAXAACKBQAgGQAAiwUAIPYCAACGBQAw9wIAAKgDABD4AgAAhgUAMPkCBADwBAAh_wIBAOQEACGDA0AA5wQAIYQDQADnBAAhnwMBAPEEACGkAwEA5AQAIawDEACHBQAhrQMQAIgFACGuAxAAiAUAIbADAACJBbADIrEDIADmBAAhBRcAANQGACAZAADVBgAgnwMAAOQFACCtAwAA5AUAIK4DAADkBQAgAwAAAKgDACABAACpAwAwAgAApQMAIAMAAACoAwAgAQAAqQMAMAIAAKUDACADAAAAqAMAIAEAAKkDADACAAClAwAgDRcAANIGACAZAADTBgAg-QIEAAAAAf8CAQAAAAGDA0AAAAABhANAAAAAAZ8DAQAAAAGkAwEAAAABrAMQAAAAAa0DEAAAAAGuAxAAAAABsAMAAACwAwKxAyAAAAABASMAAK0DACAL-QIEAAAAAf8CAQAAAAGDA0AAAAABhANAAAAAAZ8DAQAAAAGkAwEAAAABrAMQAAAAAa0DEAAAAAGuAxAAAAABsAMAAACwAwKxAyAAAAABASMAAK8DADABIwAArwMAMA0XAAC4BgAgGQAAuQYAIPkCBADqBQAh_wIBAOsFACGDA0AA7gUAIYQDQADuBQAhnwMBAOwFACGkAwEA6wUAIawDEAD6BQAhrQMQALYGACGuAxAAtgYAIbADAAC3BrADIrEDIAD0BQAhAgAAAKUDACAjAACyAwAgC_kCBADqBQAh_wIBAOsFACGDA0AA7gUAIYQDQADuBQAhnwMBAOwFACGkAwEA6wUAIawDEAD6BQAhrQMQALYGACGuAxAAtgYAIbADAAC3BrADIrEDIAD0BQAhAgAAAKgDACAjAAC0AwAgAgAAAKgDACAjAAC0AwAgAwAAAKUDACAqAACtAwAgKwAAsgMAIAEAAAClAwAgAQAAAKgDACAICgAAsQYAIDAAALIGACAxAAC1BgAgMgAAtAYAIDMAALMGACCfAwAA5AUAIK0DAADkBQAgrgMAAOQFACAO9gIAAP8EADD3AgAAuwMAEPgCAAD_BAAw-QIEAMsEACH_AgEAzAQAIYMDQADPBAAhhANAAM8EACGfAwEAzQQAIaQDAQDMBAAhrAMQAOkEACGtAxAAgAUAIa4DEACABQAhsAMAAIEFsAMisQMgAN8EACEDAAAAqAMAIAEAALoDADAvAAC7AwAgAwAAAKgDACABAACpAwAwAgAApQMAIAEAAABJACABAAAASQAgAwAAAEcAIAEAAEgAMAIAAEkAIAMAAABHACABAABIADACAABJACADAAAARwAgAQAASAAwAgAASQAgCwMAAK8GACAYAACwBgAg-QIEAAAAAf8CAQAAAAGCAwAAAKoDAoMDQAAAAAGEA0AAAAABpwMBAAAAAagDAQAAAAGqA0AAAAABqwNAAAAAAQEjAADDAwAgCfkCBAAAAAH_AgEAAAABggMAAACqAwKDA0AAAAABhANAAAAAAacDAQAAAAGoAwEAAAABqgNAAAAAAasDQAAAAAEBIwAAxQMAMAEjAADFAwAwCwMAAK0GACAYAACuBgAg-QIEAOoFACH_AgEA6wUAIYIDAACrBqoDIoMDQADuBQAhhANAAO4FACGnAwEA6wUAIagDAQDrBQAhqgNAAKwGACGrA0AArAYAIQIAAABJACAjAADIAwAgCfkCBADqBQAh_wIBAOsFACGCAwAAqwaqAyKDA0AA7gUAIYQDQADuBQAhpwMBAOsFACGoAwEA6wUAIaoDQACsBgAhqwNAAKwGACECAAAARwAgIwAAygMAIAIAAABHACAjAADKAwAgAwAAAEkAICoAAMMDACArAADIAwAgAQAAAEkAIAEAAABHACAHCgAApgYAIDAAAKcGACAxAACqBgAgMgAAqQYAIDMAAKgGACCqAwAA5AUAIKsDAADkBQAgDPYCAAD4BAAw9wIAANEDABD4AgAA-AQAMPkCBADLBAAh_wIBAMwEACGCAwAA-QSqAyKDA0AAzwQAIYQDQADPBAAhpwMBAMwEACGoAwEAzAQAIaoDQAD6BAAhqwNAAPoEACEDAAAARwAgAQAA0AMAMC8AANEDACADAAAARwAgAQAASAAwAgAASQAgAQAAAFQAIAEAAABUACADAAAAUgAgAQAAUwAwAgAAVAAgAwAAAFIAIAEAAFMAMAIAAFQAIAMAAABSACABAABTADACAABUACAJAwAApAYAIBoAAKUGACD5AgQAAAABgwNAAAAAAYQDQAAAAAGRAwAAAKYDAqQDAQAAAAGmAxAAAAABpwMBAAAAAQEjAADZAwAgB_kCBAAAAAGDA0AAAAABhANAAAAAAZEDAAAApgMCpAMBAAAAAaYDEAAAAAGnAwEAAAABASMAANsDADABIwAA2wMAMAEAAAAHACAJAwAAmQYAIBoAAJoGACD5AgQA6gUAIYMDQADuBQAhhANAAO4FACGRAwAAmAamAyKkAwEA6wUAIaYDEAD6BQAhpwMBAOwFACECAAAAVAAgIwAA3wMAIAf5AgQA6gUAIYMDQADuBQAhhANAAO4FACGRAwAAmAamAyKkAwEA6wUAIaYDEAD6BQAhpwMBAOwFACECAAAAUgAgIwAA4QMAIAIAAABSACAjAADhAwAgAQAAAAcAIAMAAABUACAqAADZAwAgKwAA3wMAIAEAAABUACABAAAAUgAgBgoAAJMGACAwAACUBgAgMQAAlwYAIDIAAJYGACAzAACVBgAgpwMAAOQFACAK9gIAAPQEADD3AgAA6QMAEPgCAAD0BAAw-QIEAMsEACGDA0AAzwQAIYQDQADPBAAhkQMAAPUEpgMipAMBAMwEACGmAxAA6QQAIacDAQDNBAAhAwAAAFIAIAEAAOgDADAvAADpAwAgAwAAAFIAIAEAAFMAMAIAAFQAIAkaAADzBAAg9gIAAO8EADD3AgAA7wMAEPgCAADvBAAw-QIEAAAAAYMDQADnBAAhngMBAAAAAZ8DAQDxBAAhoAMAAPIEACABAAAA7AMAIAEAAADsAwAgCRoAAPMEACD2AgAA7wQAMPcCAADvAwAQ-AIAAO8EADD5AgQA8AQAIYMDQADnBAAhngMBAOQEACGfAwEA8QQAIaADAADyBAAgAxoAAJIGACCfAwAA5AUAIKADAADkBQAgAwAAAO8DACABAADwAwAwAgAA7AMAIAMAAADvAwAgAQAA8AMAMAIAAOwDACADAAAA7wMAIAEAAPADADACAADsAwAgBhoAAJEGACD5AgQAAAABgwNAAAAAAZ4DAQAAAAGfAwEAAAABoAOAAAAAAQEjAAD0AwAgBfkCBAAAAAGDA0AAAAABngMBAAAAAZ8DAQAAAAGgA4AAAAABASMAAPYDADABIwAA9gMAMAYaAACEBgAg-QIEAOoFACGDA0AA7gUAIZ4DAQDrBQAhnwMBAOwFACGgA4AAAAABAgAAAOwDACAjAAD5AwAgBfkCBADqBQAhgwNAAO4FACGeAwEA6wUAIZ8DAQDsBQAhoAOAAAAAAQIAAADvAwAgIwAA-wMAIAIAAADvAwAgIwAA-wMAIAMAAADsAwAgKgAA9AMAICsAAPkDACABAAAA7AMAIAEAAADvAwAgBwoAAP8FACAwAACABgAgMQAAgwYAIDIAAIIGACAzAACBBgAgnwMAAOQFACCgAwAA5AUAIAj2AgAA7AQAMPcCAACCBAAQ-AIAAOwEADD5AgQAywQAIYMDQADPBAAhngMBAMwEACGfAwEAzQQAIaADAADtBAAgAwAAAO8DACABAACBBAAwLwAAggQAIAMAAADvAwAgAQAA8AMAMAIAAOwDACABAAAAWQAgAQAAAFkAIAMAAABXACABAABYADACAABZACADAAAAVwAgAQAAWAAwAgAAWQAgAwAAAFcAIAEAAFgAMAIAAFkAIAkbAAD9BQAgHAAA_gUAIPkCBAAAAAGDA0AAAAABmgMEAAAAAZsDBAAAAAGcAxAAAAABnQMQAAAAAZ4DAQAAAAEBIwAAigQAIAf5AgQAAAABgwNAAAAAAZoDBAAAAAGbAwQAAAABnAMQAAAAAZ0DEAAAAAGeAwEAAAABASMAAIwEADABIwAAjAQAMAkbAAD7BQAgHAAA_AUAIPkCBADqBQAhgwNAAO4FACGaAwQA6gUAIZsDBADqBQAhnAMQAPoFACGdAxAA-gUAIZ4DAQDrBQAhAgAAAFkAICMAAI8EACAH-QIEAOoFACGDA0AA7gUAIZoDBADqBQAhmwMEAOoFACGcAxAA-gUAIZ0DEAD6BQAhngMBAOsFACECAAAAVwAgIwAAkQQAIAIAAABXACAjAACRBAAgAwAAAFkAICoAAIoEACArAACPBAAgAQAAAFkAIAEAAABXACAFCgAA9QUAIDAAAPYFACAxAAD5BQAgMgAA-AUAIDMAAPcFACAK9gIAAOgEADD3AgAAmAQAEPgCAADoBAAw-QIEAMsEACGDA0AAzwQAIZoDBADLBAAhmwMEAMsEACGcAxAA6QQAIZ0DEADpBAAhngMBAMwEACEDAAAAVwAgAQAAlwQAMC8AAJgEACADAAAAVwAgAQAAWAAwAgAAWQAgCfYCAADjBAAw9wIAAJ4EABD4AgAA4wQAMPkCAQAAAAGDA0AA5wQAIZADAQDkBAAhkQMBAOQEACGSAwAA5QQAIJMDIADmBAAhAQAAAJsEACABAAAAmwQAIAn2AgAA4wQAMPcCAACeBAAQ-AIAAOMEADD5AgEA5AQAIYMDQADnBAAhkAMBAOQEACGRAwEA5AQAIZIDAADlBAAgkwMgAOYEACEAAwAAAJ4EACABAACfBAAwAgAAmwQAIAMAAACeBAAgAQAAnwQAMAIAAJsEACADAAAAngQAIAEAAJ8EADACAACbBAAgBvkCAQAAAAGDA0AAAAABkAMBAAAAAZEDAQAAAAGSA4AAAAABkwMgAAAAAQEjAACjBAAgBvkCAQAAAAGDA0AAAAABkAMBAAAAAZEDAQAAAAGSA4AAAAABkwMgAAAAAQEjAAClBAAwASMAAKUEADAG-QIBAOsFACGDA0AA7gUAIZADAQDrBQAhkQMBAOsFACGSA4AAAAABkwMgAPQFACECAAAAmwQAICMAAKgEACAG-QIBAOsFACGDA0AA7gUAIZADAQDrBQAhkQMBAOsFACGSA4AAAAABkwMgAPQFACECAAAAngQAICMAAKoEACACAAAAngQAICMAAKoEACADAAAAmwQAICoAAKMEACArAACoBAAgAQAAAJsEACABAAAAngQAIAMKAADxBQAgMgAA8wUAIDMAAPIFACAJ9gIAAN0EADD3AgAAsQQAEPgCAADdBAAw-QIBAMwEACGDA0AAzwQAIZADAQDMBAAhkQMBAMwEACGSAwAA3gQAIJMDIADfBAAhAwAAAJ4EACABAACwBAAwLwAAsQQAIAMAAACeBAAgAQAAnwQAMAIAAJsEACABAAAATgAgAQAAAE4AIAMAAABMACABAABNADACAABOACADAAAATAAgAQAATQAwAgAATgAgAwAAAEwAIAEAAE0AMAIAAE4AIAwYAADwBQAg-QIEAAAAAfoCAQAAAAH7AgEAAAAB_AIBAAAAAf0CAQAAAAH-AgEAAAAB_wIBAAAAAYADAQAAAAGCAwAAAIIDAoMDQAAAAAGEA0AAAAABASMAALkEACAL-QIEAAAAAfoCAQAAAAH7AgEAAAAB_AIBAAAAAf0CAQAAAAH-AgEAAAAB_wIBAAAAAYADAQAAAAGCAwAAAIIDAoMDQAAAAAGEA0AAAAABASMAALsEADABIwAAuwQAMAwYAADvBQAg-QIEAOoFACH6AgEA6wUAIfsCAQDrBQAh_AIBAOsFACH9AgEA6wUAIf4CAQDrBQAh_wIBAOsFACGAAwEA7AUAIYIDAADtBYIDIoMDQADuBQAhhANAAO4FACECAAAATgAgIwAAvgQAIAv5AgQA6gUAIfoCAQDrBQAh-wIBAOsFACH8AgEA6wUAIf0CAQDrBQAh_gIBAOsFACH_AgEA6wUAIYADAQDsBQAhggMAAO0FggMigwNAAO4FACGEA0AA7gUAIQIAAABMACAjAADABAAgAgAAAEwAICMAAMAEACADAAAATgAgKgAAuQQAICsAAL4EACABAAAATgAgAQAAAEwAIAYKAADlBQAgMAAA5gUAIDEAAOkFACAyAADoBQAgMwAA5wUAIIADAADkBQAgDvYCAADKBAAw9wIAAMcEABD4AgAAygQAMPkCBADLBAAh-gIBAMwEACH7AgEAzAQAIfwCAQDMBAAh_QIBAMwEACH-AgEAzAQAIf8CAQDMBAAhgAMBAM0EACGCAwAAzgSCAyKDA0AAzwQAIYQDQADPBAAhAwAAAEwAIAEAAMYEADAvAADHBAAgAwAAAEwAIAEAAE0AMAIAAE4AIA72AgAAygQAMPcCAADHBAAQ-AIAAMoEADD5AgQAywQAIfoCAQDMBAAh-wIBAMwEACH8AgEAzAQAIf0CAQDMBAAh_gIBAMwEACH_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-QIEAMsEACH_AgEAzAQAIYIDAAD5BKoDIoMDQADPBAAhhANAAM8EACGnAwEAzAQAIagDAQDMBAAhqgNAAPoEACGrA0AA-gQAIQcKAADRBAAgMgAA_gQAIDMAAP4EACCFAwAAAKoDAoYDAAAAqgMIhwMAAACqAwiMAwAA_QSqAyILCgAA1gQAIDIAAPwEACAzAAD8BAAghQNAAAAAAYYDQAAAAAWHA0AAAAAFiANAAAAAAYkDQAAAAAGKA0AAAAABiwNAAAAAAYwDQAD7BAAhCwoAANYEACAyAAD8BAAgMwAA_AQAIIUDQAAAAAGGA0AAAAAFhwNAAAAABYgDQAAAAAGJA0AAAAABigNAAAAAAYsDQAAAAAGMA0AA-wQAIQiFA0AAAAABhgNAAAAABYcDQAAAAAWIA0AAAAABiQNAAAAAAYoDQAAAAAGLA0AAAAABjANAAPwEACEHCgAA0QQAIDIAAP4EACAzAAD-BAAghQMAAACqAwKGAwAAAKoDCIcDAAAAqgMIjAMAAP0EqgMiBIUDAAAAqgMChgMAAACqAwiHAwAAAKoDCIwDAAD-BKoDIg72AgAA_wQAMPcCAAC7AwAQ-AIAAP8EADD5AgQAywQAIf8CAQDMBAAhgwNAAM8EACGEA0AAzwQAIZ8DAQDNBAAhpAMBAMwEACGsAxAA6QQAIa0DEACABQAhrgMQAIAFACGwAwAAgQWwAyKxAyAA3wQAIQ0KAADWBAAgMAAAhQUAIDEAAIUFACAyAACFBQAgMwAAhQUAIIUDEAAAAAGGAxAAAAAFhwMQAAAABYgDEAAAAAGJAxAAAAABigMQAAAAAYsDEAAAAAGMAxAAhAUAIQcKAADRBAAgMgAAgwUAIDMAAIMFACCFAwAAALADAoYDAAAAsAMIhwMAAACwAwiMAwAAggWwAyIHCgAA0QQAIDIAAIMFACAzAACDBQAghQMAAACwAwKGAwAAALADCIcDAAAAsAMIjAMAAIIFsAMiBIUDAAAAsAMChgMAAACwAwiHAwAAALADCIwDAACDBbADIg0KAADWBAAgMAAAhQUAIDEAAIUFACAyAACFBQAgMwAAhQUAIIUDEAAAAAGGAxAAAAAFhwMQAAAABYgDEAAAAAGJAxAAAAABigMQAAAAAYsDEAAAAAGMAxAAhAUAIQiFAxAAAAABhgMQAAAABYcDEAAAAAWIAxAAAAABiQMQAAAAAYoDEAAAAAGLAxAAAAABjAMQAIUFACEQFwAAigUAIBkAAIsFACD2AgAAhgUAMPcCAACoAwAQ-AIAAIYFADD5AgQA8AQAIf8CAQDkBAAhgwNAAOcEACGEA0AA5wQAIZ8DAQDxBAAhpAMBAOQEACGsAxAAhwUAIa0DEACIBQAhrgMQAIgFACGwAwAAiQWwAyKxAyAA5gQAIQiFAxAAAAABhgMQAAAABIcDEAAAAASIAxAAAAABiQMQAAAAAYoDEAAAAAGLAxAAAAABjAMQAOsEACEIhQMQAAAAAYYDEAAAAAWHAxAAAAAFiAMQAAAAAYkDEAAAAAGKAxAAAAABiwMQAAAAAYwDEACFBQAhBIUDAAAAsAMChgMAAACwAwiHAwAAALADCIwDAACDBbADIgOhAwAARwAgogMAAEcAIKMDAABHACADoQMAAEwAIKIDAABMACCjAwAATAAgCfYCAACMBQAw9wIAAKIDABD4AgAAjAUAMPkCBADLBAAhgwNAAM8EACGyAwEAzAQAIbMDAQDMBAAhtAMBAM0EACG1AwEAzAQAIQv2AgAAjQUAMPcCAACKAwAQ-AIAAI0FADD5AgQAywQAIYMDQADPBAAhkQMAAI4FuAMimgMBAMwEACGfAwEAzQQAIbYDAQDMBAAhuAMQAOkEACG5AwEAzQQAIQcKAADRBAAgMgAAkAUAIDMAAJAFACCFAwAAALgDAoYDAAAAuAMIhwMAAAC4AwiMAwAAjwW4AyIHCgAA0QQAIDIAAJAFACAzAACQBQAghQMAAAC4AwKGAwAAALgDCIcDAAAAuAMIjAMAAI8FuAMiBIUDAAAAuAMChgMAAAC4AwiHAwAAALgDCIwDAACQBbgDIgv2AgAAkQUAMPcCAAD0AgAQ-AIAAJEFADD5AgQAywQAIYIDAACSBb0DIoMDQADPBAAhhANAAM8EACG2AwEAzAQAIbgDEADpBAAhugMBAMwEACG7AwEAzQQAIQcKAADRBAAgMgAAlAUAIDMAAJQFACCFAwAAAL0DAoYDAAAAvQMIhwMAAAC9AwiMAwAAkwW9AyIHCgAA0QQAIDIAAJQFACAzAACUBQAghQMAAAC9AwKGAwAAAL0DCIcDAAAAvQMIjAMAAJMFvQMiBIUDAAAAvQMChgMAAAC9AwiHAwAAAL0DCIwDAACUBb0DIg32AgAAlQUAMPcCAADeAgAQ-AIAAJUFADD5AgQAywQAIYIDAACWBb8DIoMDQADPBAAhhANAAM8EACG4AxAA6QQAIbsDAQDMBAAhvQMBAMwEACG_AwEAzQQAIcADAQDNBAAhwQMAAO0EACAHCgAA0QQAIDIAAJgFACAzAACYBQAghQMAAAC_AwKGAwAAAL8DCIcDAAAAvwMIjAMAAJcFvwMiBwoAANEEACAyAACYBQAgMwAAmAUAIIUDAAAAvwMChgMAAAC_AwiHAwAAAL8DCIwDAACXBb8DIgSFAwAAAL8DAoYDAAAAvwMIhwMAAAC_AwiMAwAAmAW_AyIM9gIAAJkFADD3AgAAyAIAEPgCAACZBQAw-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-gIBAOQEACH7AgEA5AQAIfwCAQDkBAAh_QIBAOQEACH-AgEA5AQAIf8CAQDkBAAhgAMBAPEEACGCAwAAugWCAyKDA0AA5wQAIYQDQADnBAAhBIUDAAAAggMChgMAAACCAwiHAwAAAIIDCIwDAADUBIIDIhIXAACKBQAgGQAAiwUAIPYCAACGBQAw9wIAAKgDABD4AgAAhgUAMPkCBADwBAAh_wIBAOQEACGDA0AA5wQAIYQDQADnBAAhnwMBAPEEACGkAwEA5AQAIawDEACHBQAhrQMQAIgFACGuAxAAiAUAIbADAACJBbADIrEDIADmBAAh4wMAAKgDACDkAwAAqAMAIA4DAAC_BQAgGAAAuwUAIPYCAAC8BQAw9wIAAEcAEPgCAAC8BQAw-QIEAPAEACH_AgEA5AQAIYIDAAC9BaoDIoMDQADnBAAhhANAAOcEACGnAwEA5AQAIagDAQDkBAAhqgNAAL4FACGrA0AAvgUAIQSFAwAAAKoDAoYDAAAAqgMIhwMAAACqAwiMAwAA_gSqAyIIhQNAAAAAAYYDQAAAAAWHA0AAAAAFiANAAAAAAYkDQAAAAAGKA0AAAAABiwNAAAAAAYwDQAD8BAAhEAkAAKgFACAWAADaBQAgFwAAigUAIBgBAOQEACEdAADbBQAg9gIAANkFADD3AgAABwAQ-AIAANkFADD5AgQA8AQAIYMDQADnBAAhhANAAOcEACGkAwEA5AQAIacDAQDkBAAh4QMBAPEEACHjAwAABwAg5AMAAAcAIAsGAADCBQAg9gIAAMAFADD3AgAAOgAQ-AIAAMAFADD5AgQA8AQAIYMDQADnBAAhtgMEAPAEACHVA0AA5wQAIdYDAQDkBAAh1wMCAMEFACHYAyAA5gQAIQiFAwIAAAABhgMCAAAABIcDAgAAAASIAwIAAAABiQMCAAAAAYoDAgAAAAGLAwIAAAABjAMCANEEACEbAwAAuAUAIAQAAN4FACAFAADaBQAgBwAA3wUAIAgAAOAFACAPAADRBQAgEAAA0gUAIBMAAOEFACAUAADiBQAgFQAA4wUAIPYCAADcBQAw9wIAAAMAEPgCAADcBQAw-QIEAPAEACH7AgEA5AQAIYMDQADnBAAhhANAAOcEACGkAwEA8QQAIacDAQDxBAAhtQMBAPEEACG2AwEA5AQAIdwDAQDkBAAh3gMAAN0F3gMi3wMgAOYEACHgAwEA8QQAIeMDAAADACDkAwAAAwAgDAYAAMIFACD2AgAAwwUAMPcCAAA2ABD4AgAAwwUAMPkCBADwBAAhgwNAAOcEACGRAwAAxAW4AyKaAwEA5AQAIZ8DAQDxBAAhtgMBAOQEACG4AxAAhwUAIbkDAQDxBAAhBIUDAAAAuAMChgMAAAC4AwiHAwAAALgDCIwDAACQBbgDIgwGAADCBQAg9gIAAMUFADD3AgAAMgAQ-AIAAMUFADD5AgQA8AQAIYIDAADGBb0DIoMDQADnBAAhhANAAOcEACG2AwEA5AQAIbgDEACHBQAhugMBAOQEACG7AwEA8QQAIQSFAwAAAL0DAoYDAAAAvQMIhwMAAAC9AwiMAwAAlAW9AyIOEQAAyQUAIPYCAADHBQAw9wIAACwAEPgCAADHBQAw-QIEAPAEACGCAwAAyAW_AyKDA0AA5wQAIYQDQADnBAAhuAMQAIcFACG7AwEA5AQAIb0DAQDkBAAhvwMBAPEEACHAAwEA8QQAIcEDAADyBAAgBIUDAAAAvwMChgMAAAC_AwiHAwAAAL8DCIwDAACYBb8DIhEGAADCBQAgDAAAzQUAIBIAANUFACD2AgAA0wUAMPcCAAATABD4AgAA0wUAMPkCBADwBAAhggMAANQFxAMigwNAAOcEACGEA0AA5wQAIbQDAQDkBAAhtgMBAOQEACG4AxAAhwUAIb0DAQDkBAAhwgNAAOcEACHjAwAAEwAg5AMAABMAIAsMAADLBQAgDgAAwgUAIPYCAADKBQAw9wIAACMAEPgCAADKBQAw-QIEAPAEACGDA0AA5wQAIbIDAQDkBAAhswMBAOQEACG0AwEA8QQAIbUDAQDkBAAhGQMAALgFACALAADPBQAgDQAA0AUAIA8AANEFACAQAADSBQAg9gIAAM4FADD3AgAAGgAQ-AIAAM4FADD5AgQA8AQAIYMDQADnBAAhhANAAOcEACGfAwEA8QQAIaQDAQDkBAAhpwMBAPEEACGsAxAAhwUAIbEDIADmBAAhtAMBAOQEACHMAwIAwQUAIdADAQDkBAAh0QMQAIcFACHSAxAAhwUAIdMDEACHBQAh1AMBAPEEACHjAwAAGgAg5AMAABoAIA8MAADNBQAg9gIAAMwFADD3AgAAHwAQ-AIAAMwFADD5AgQA8AQAIYMDQADnBAAhhANAAOcEACGsAxAAhwUAIbQDAQDkBAAhxwMBAOQEACHIAwEA5AQAIckDAQDxBAAhygMAAKIFACDLAwAAogUAIMwDAgDBBQAhGQMAALgFACALAADPBQAgDQAA0AUAIA8AANEFACAQAADSBQAg9gIAAM4FADD3AgAAGgAQ-AIAAM4FADD5AgQA8AQAIYMDQADnBAAhhANAAOcEACGfAwEA8QQAIaQDAQDkBAAhpwMBAPEEACGsAxAAhwUAIbEDIADmBAAhtAMBAOQEACHMAwIAwQUAIdADAQDkBAAh0QMQAIcFACHSAxAAhwUAIdMDEACHBQAh1AMBAPEEACHjAwAAGgAg5AMAABoAIBcDAAC4BQAgCwAAzwUAIA0AANAFACAPAADRBQAgEAAA0gUAIPYCAADOBQAw9wIAABoAEPgCAADOBQAw-QIEAPAEACGDA0AA5wQAIYQDQADnBAAhnwMBAPEEACGkAwEA5AQAIacDAQDxBAAhrAMQAIcFACGxAyAA5gQAIbQDAQDkBAAhzAMCAMEFACHQAwEA5AQAIdEDEACHBQAh0gMQAIcFACHTAxAAhwUAIdQDAQDxBAAhDQkAAKgFACD2AgAApwUAMPcCAAAYABD4AgAApwUAMPkCBADwBAAhgwNAAOcEACGEA0AA5wQAIZ8DAQDxBAAhpAMBAOQEACHQAwEA5AQAIdQDAQDkBAAh4wMAABgAIOQDAAAYACADoQMAAB8AIKIDAAAfACCjAwAAHwAgA6EDAAAjACCiAwAAIwAgowMAACMAIAOhAwAAEwAgogMAABMAIKMDAAATACAPBgAAwgUAIAwAAM0FACASAADVBQAg9gIAANMFADD3AgAAEwAQ-AIAANMFADD5AgQA8AQAIYIDAADUBcQDIoMDQADnBAAhhANAAOcEACG0AwEA5AQAIbYDAQDkBAAhuAMQAIcFACG9AwEA5AQAIcIDQADnBAAhBIUDAAAAxAMChgMAAADEAwiHAwAAAMQDCIwDAACcBcQDIgOhAwAALAAgogMAACwAIKMDAAAsACALBgAAwgUAIPYCAADWBQAw9wIAAA8AEPgCAADWBQAw-QIEAPAEACGCAwAA1wXGAyKDA0AA5wQAIYQDQADnBAAhtgMBAOQEACHEAwEA5AQAIcYDAADyBAAgBIUDAAAAxgMChgMAAADGAwiHAwAAAMYDCIwDAACgBcYDIgsGAADCBQAg9gIAANgFADD3AgAACwAQ-AIAANgFADD5AgQA8AQAIYMDQADnBAAhtgMEAPAEACHVA0AA5wQAIdkDAQDkBAAh2gMBAOQEACHbAyAA5gQAIQ4JAACoBQAgFgAA2gUAIBcAAIoFACAYAQDkBAAhHQAA2wUAIPYCAADZBQAw9wIAAAcAEPgCAADZBQAw-QIEAPAEACGDA0AA5wQAIYQDQADnBAAhpAMBAOQEACGnAwEA5AQAIeEDAQDxBAAhA6EDAAADACCiAwAAAwAgowMAAAMAIAOhAwAAUgAgogMAAFIAIKMDAABSACAZAwAAuAUAIAQAAN4FACAFAADaBQAgBwAA3wUAIAgAAOAFACAPAADRBQAgEAAA0gUAIBMAAOEFACAUAADiBQAgFQAA4wUAIPYCAADcBQAw9wIAAAMAEPgCAADcBQAw-QIEAPAEACH7AgEA5AQAIYMDQADnBAAhhANAAOcEACGkAwEA8QQAIacDAQDxBAAhtQMBAPEEACG2AwEA5AQAIdwDAQDkBAAh3gMAAN0F3gMi3wMgAOYEACHgAwEA8QQAIQSFAwAAAN4DAoYDAAAA3gMIhwMAAADeAwiMAwAAsAXeAyIbAwAAuAUAIAQAAN4FACAFAADaBQAgBwAA3wUAIAgAAOAFACAPAADRBQAgEAAA0gUAIBMAAOEFACAUAADiBQAgFQAA4wUAIPYCAADcBQAw9wIAAAMAEPgCAADcBQAw-QIEAPAEACH7AgEA5AQAIYMDQADnBAAhhANAAOcEACGkAwEA8QQAIacDAQDxBAAhtQMBAPEEACG2AwEA5AQAIdwDAQDkBAAh3gMAAN0F3gMi3wMgAOYEACHgAwEA8QQAIeMDAAADACDkAwAAAwAgA6EDAAALACCiAwAACwAgowMAAAsAIAOhAwAADwAgogMAAA8AIKMDAAAPACADoQMAADIAIKIDAAAyACCjAwAAMgAgA6EDAAA2ACCiAwAANgAgowMAADYAIAOhAwAAOgAgogMAADoAIKMDAAA6ACAAAAAAAAAF6AMEAAAAAe4DBAAAAAHvAwQAAAAB8AMEAAAAAfEDBAAAAAEB6AMBAAAAAQHoAwEAAAABAegDAAAAggMCAegDQAAAAAEFKgAArwoAICsAALIKACDlAwAAsAoAIOYDAACxCgAg6wMAAKUDACADKgAArwoAIOUDAACwCgAg6wMAAKUDACAAAAAB6AMgAAAAAQAAAAAABegDEAAAAAHuAxAAAAAB7wMQAAAAAfADEAAAAAHxAxAAAAABBSoAAKcKACArAACtCgAg5QMAAKgKACDmAwAArAoAIOsDAADsAwAgBSoAAKUKACArAACqCgAg5QMAAKYKACDmAwAAqQoAIOsDAABUACADKgAApwoAIOUDAACoCgAg6wMAAOwDACADKgAApQoAIOUDAACmCgAg6wMAAFQAIAAAAAAACyoAAIUGADArAACKBgAw5QMAAIYGADDmAwAAhwYAMOcDAACIBgAg6AMAAIkGADDpAwAAiQYAMOoDAACJBgAw6wMAAIkGADDsAwAAiwYAMO0DAACMBgAwBxwAAP4FACD5AgQAAAABgwNAAAAAAZsDBAAAAAGcAxAAAAABnQMQAAAAAZ4DAQAAAAECAAAAWQAgKgAAkAYAIAMAAABZACAqAACQBgAgKwAAjwYAIAEjAACkCgAwDBsAALMFACAcAAC0BQAg9gIAALIFADD3AgAAVwAQ-AIAALIFADD5AgQAAAABgwNAAOcEACGaAwQA8AQAIZsDBADwBAAhnAMQAIcFACGdAxAAhwUAIZ4DAQAAAAECAAAAWQAgIwAAjwYAIAIAAACNBgAgIwAAjgYAIAr2AgAAjAYAMPcCAACNBgAQ-AIAAIwGADD5AgQA8AQAIYMDQADnBAAhmgMEAPAEACGbAwQA8AQAIZwDEACHBQAhnQMQAIcFACGeAwEA5AQAIQr2AgAAjAYAMPcCAACNBgAQ-AIAAIwGADD5AgQA8AQAIYMDQADnBAAhmgMEAPAEACGbAwQA8AQAIZwDEACHBQAhnQMQAIcFACGeAwEA5AQAIQb5AgQA6gUAIYMDQADuBQAhmwMEAOoFACGcAxAA-gUAIZ0DEAD6BQAhngMBAOsFACEHHAAA_AUAIPkCBADqBQAhgwNAAO4FACGbAwQA6gUAIZwDEAD6BQAhnQMQAPoFACGeAwEA6wUAIQccAAD-BQAg-QIEAAAAAYMDQAAAAAGbAwQAAAABnAMQAAAAAZ0DEAAAAAGeAwEAAAABBCoAAIUGADDlAwAAhgYAMOcDAACIBgAg6wMAAIkGADAAAAAAAAAB6AMAAACmAwIHKgAAngoAICsAAKIKACDlAwAAnwoAIOYDAAChCgAg6QMAAAcAIOoDAAAHACDrAwAAAQAgCyoAAJsGADArAACfBgAw5QMAAJwGADDmAwAAnQYAMOcDAACeBgAg6AMAAIkGADDpAwAAiQYAMOoDAACJBgAw6wMAAIkGADDsAwAAoAYAMO0DAACMBgAwBxsAAP0FACD5AgQAAAABgwNAAAAAAZoDBAAAAAGcAxAAAAABnQMQAAAAAZ4DAQAAAAECAAAAWQAgKgAAowYAIAMAAABZACAqAACjBgAgKwAAogYAIAEjAACgCgAwAgAAAFkAICMAAKIGACACAAAAjQYAICMAAKEGACAG-QIEAOoFACGDA0AA7gUAIZoDBADqBQAhnAMQAPoFACGdAxAA-gUAIZ4DAQDrBQAhBxsAAPsFACD5AgQA6gUAIYMDQADuBQAhmgMEAOoFACGcAxAA-gUAIZ0DEAD6BQAhngMBAOsFACEHGwAA_QUAIPkCBAAAAAGDA0AAAAABmgMEAAAAAZwDEAAAAAGdAxAAAAABngMBAAAAAQMqAACeCgAg5QMAAJ8KACDrAwAAAQAgBCoAAJsGADDlAwAAnAYAMOcDAACeBgAg6wMAAIkGADAAAAAAAAHoAwAAAKoDAgHoA0AAAAABBSoAAJYKACArAACcCgAg5QMAAJcKACDmAwAAmwoAIOsDAAABACAFKgAAlAoAICsAAJkKACDlAwAAlQoAIOYDAACYCgAg6wMAAKUDACADKgAAlgoAIOUDAACXCgAg6wMAAAEAIAMqAACUCgAg5QMAAJUKACDrAwAApQMAIAAAAAAABegDEAAAAAHuAxAAAAAB7wMQAAAAAfADEAAAAAHxAxAAAAABAegDAAAAsAMCCyoAAMYGADArAADLBgAw5QMAAMcGADDmAwAAyAYAMOcDAADJBgAg6AMAAMoGADDpAwAAygYAMOoDAADKBgAw6wMAAMoGADDsAwAAzAYAMO0DAADNBgAwCyoAALoGADArAAC_BgAw5QMAALsGADDmAwAAvAYAMOcDAAC9BgAg6AMAAL4GADDpAwAAvgYAMOoDAAC-BgAw6wMAAL4GADDsAwAAwAYAMO0DAADBBgAwCvkCBAAAAAH6AgEAAAAB-wIBAAAAAfwCAQAAAAH9AgEAAAAB_gIBAAAAAYADAQAAAAGCAwAAAIIDAoMDQAAAAAGEA0AAAAABAgAAAE4AICoAAMUGACADAAAATgAgKgAAxQYAICsAAMQGACABIwAAkwoAMA8YAAC7BQAg9gIAALkFADD3AgAATAAQ-AIAALkFADD5AgQAAAAB-gIBAAAAAfsCAQAAAAH8AgEA5AQAIf0CAQDkBAAh_gIBAOQEACH_AgEA5AQAIYADAQAAAAGCAwAAugWCAyKDA0AA5wQAIYQDQADnBAAhAgAAAE4AICMAAMQGACACAAAAwgYAICMAAMMGACAO9gIAAMEGADD3AgAAwgYAEPgCAADBBgAw-QIEAPAEACH6AgEA5AQAIfsCAQDkBAAh_AIBAOQEACH9AgEA5AQAIf4CAQDkBAAh_wIBAOQEACGAAwEA8QQAIYIDAAC6BYIDIoMDQADnBAAhhANAAOcEACEO9gIAAMEGADD3AgAAwgYAEPgCAADBBgAw-QIEAPAEACH6AgEA5AQAIfsCAQDkBAAh_AIBAOQEACH9AgEA5AQAIf4CAQDkBAAh_wIBAOQEACGAAwEA8QQAIYIDAAC6BYIDIoMDQADnBAAhhANAAOcEACEK-QIEAOoFACH6AgEA6wUAIfsCAQDrBQAh_AIBAOsFACH9AgEA6wUAIf4CAQDrBQAhgAMBAOwFACGCAwAA7QWCAyKDA0AA7gUAIYQDQADuBQAhCvkCBADqBQAh-gIBAOsFACH7AgEA6wUAIfwCAQDrBQAh_QIBAOsFACH-AgEA6wUAIYADAQDsBQAhggMAAO0FggMigwNAAO4FACGEA0AA7gUAIQr5AgQAAAAB-gIBAAAAAfsCAQAAAAH8AgEAAAAB_QIBAAAAAf4CAQAAAAGAAwEAAAABggMAAACCAwKDA0AAAAABhANAAAAAAQkDAACvBgAg-QIEAAAAAYIDAAAAqgMCgwNAAAAAAYQDQAAAAAGnAwEAAAABqAMBAAAAAaoDQAAAAAGrA0AAAAABAgAAAEkAICoAANEGACADAAAASQAgKgAA0QYAICsAANAGACABIwAAkgoAMA4DAAC_BQAgGAAAuwUAIPYCAAC8BQAw9wIAAEcAEPgCAAC8BQAw-QIEAAAAAf8CAQDkBAAhggMAAL0FqgMigwNAAOcEACGEA0AA5wQAIacDAQDkBAAhqAMBAAAAAaoDQAC-BQAhqwNAAL4FACECAAAASQAgIwAA0AYAIAIAAADOBgAgIwAAzwYAIAz2AgAAzQYAMPcCAADOBgAQ-AIAAM0GADD5AgQA8AQAIf8CAQDkBAAhggMAAL0FqgMigwNAAOcEACGEA0AA5wQAIacDAQDkBAAhqAMBAOQEACGqA0AAvgUAIasDQAC-BQAhDPYCAADNBgAw9wIAAM4GABD4AgAAzQYAMPkCBADwBAAh_wIBAOQEACGCAwAAvQWqAyKDA0AA5wQAIYQDQADnBAAhpwMBAOQEACGoAwEA5AQAIaoDQAC-BQAhqwNAAL4FACEI-QIEAOoFACGCAwAAqwaqAyKDA0AA7gUAIYQDQADuBQAhpwMBAOsFACGoAwEA6wUAIaoDQACsBgAhqwNAAKwGACEJAwAArQYAIPkCBADqBQAhggMAAKsGqgMigwNAAO4FACGEA0AA7gUAIacDAQDrBQAhqAMBAOsFACGqA0AArAYAIasDQACsBgAhCQMAAK8GACD5AgQAAAABggMAAACqAwKDA0AAAAABhANAAAAAAacDAQAAAAGoAwEAAAABqgNAAAAAAasDQAAAAAEEKgAAxgYAMOUDAADHBgAw5wMAAMkGACDrAwAAygYAMAQqAAC6BgAw5QMAALsGADDnAwAAvQYAIOsDAAC-BgAwAAAAAAAAAAUqAACKCgAgKwAAkAoAIOUDAACLCgAg5gMAAI8KACDrAwAABQAgByoAAIgKACArAACNCgAg5QMAAIkKACDmAwAAjAoAIOkDAAAaACDqAwAAGgAg6wMAABwAIAMqAACKCgAg5QMAAIsKACDrAwAABQAgAyoAAIgKACDlAwAAiQoAIOsDAAAcACAAAAAAAAHoAwAAALgDAgUqAACDCgAgKwAAhgoAIOUDAACECgAg5gMAAIUKACDrAwAABQAgAyoAAIMKACDlAwAAhAoAIOsDAAAFACAAAAAAAAHoAwAAAL0DAgUqAAD-CQAgKwAAgQoAIOUDAAD_CQAg5gMAAIAKACDrAwAABQAgAyoAAP4JACDlAwAA_wkAIOsDAAAFACAAAAAAAAHoAwAAAL8DAgUqAAD5CQAgKwAA_AkAIOUDAAD6CQAg5gMAAPsJACDrAwAAFQAgAyoAAPkJACDlAwAA-gkAIOsDAAAVACAAAAAAAAHoAwAAAMQDAgUqAADwCQAgKwAA9wkAIOUDAADxCQAg5gMAAPYJACDrAwAABQAgBSoAAO4JACArAAD0CQAg5QMAAO8JACDmAwAA8wkAIOsDAAAcACALKgAAgAcAMCsAAIUHADDlAwAAgQcAMOYDAACCBwAw5wMAAIMHACDoAwAAhAcAMOkDAACEBwAw6gMAAIQHADDrAwAAhAcAMOwDAACGBwAw7QMAAIcHADAJ-QIEAAAAAYIDAAAAvwMCgwNAAAAAAYQDQAAAAAG4AxAAAAABuwMBAAAAAb8DAQAAAAHAAwEAAAABwQOAAAAAAQIAAAAuACAqAACLBwAgAwAAAC4AICoAAIsHACArAACKBwAgASMAAPIJADAOEQAAyQUAIPYCAADHBQAw9wIAACwAEPgCAADHBQAw-QIEAAAAAYIDAADIBb8DIoMDQADnBAAhhANAAOcEACG4AxAAhwUAIbsDAQAAAAG9AwEA5AQAIb8DAQAAAAHAAwEAAAABwQMAAPIEACACAAAALgAgIwAAigcAIAIAAACIBwAgIwAAiQcAIA32AgAAhwcAMPcCAACIBwAQ-AIAAIcHADD5AgQA8AQAIYIDAADIBb8DIoMDQADnBAAhhANAAOcEACG4AxAAhwUAIbsDAQDkBAAhvQMBAOQEACG_AwEA8QQAIcADAQDxBAAhwQMAAPIEACAN9gIAAIcHADD3AgAAiAcAEPgCAACHBwAw-QIEAPAEACGCAwAAyAW_AyKDA0AA5wQAIYQDQADnBAAhuAMQAIcFACG7AwEA5AQAIb0DAQDkBAAhvwMBAPEEACHAAwEA8QQAIcEDAADyBAAgCfkCBADqBQAhggMAAPQGvwMigwNAAO4FACGEA0AA7gUAIbgDEAD6BQAhuwMBAOsFACG_AwEA7AUAIcADAQDsBQAhwQOAAAAAAQn5AgQA6gUAIYIDAAD0Br8DIoMDQADuBQAhhANAAO4FACG4AxAA-gUAIbsDAQDrBQAhvwMBAOwFACHAAwEA7AUAIcEDgAAAAAEJ-QIEAAAAAYIDAAAAvwMCgwNAAAAAAYQDQAAAAAG4AxAAAAABuwMBAAAAAb8DAQAAAAHAAwEAAAABwQOAAAAAAQMqAADwCQAg5QMAAPEJACDrAwAABQAgAyoAAO4JACDlAwAA7wkAIOsDAAAcACAEKgAAgAcAMOUDAACBBwAw5wMAAIMHACDrAwAAhAcAMAAAAAAAAegDAAAAxgMCBSoAAOkJACArAADsCQAg5QMAAOoJACDmAwAA6wkAIOsDAAAFACADKgAA6QkAIOUDAADqCQAg6wMAAAUAIAAAAAAAAugDAQAAAATyAwEAAAAFAugDAQAAAATyAwEAAAAFBegDAgAAAAHuAwIAAAAB7wMCAAAAAfADAgAAAAHxAwIAAAABBSoAAOQJACArAADnCQAg5QMAAOUJACDmAwAA5gkAIOsDAAAcACAB6AMBAAAABAHoAwEAAAAEAyoAAOQJACDlAwAA5QkAIOsDAAAcACAAAAAAAAcqAADZCQAgKwAA4gkAIOUDAADaCQAg5gMAAOEJACDpAwAABwAg6gMAAAcAIOsDAAABACAHKgAA1wkAICsAAN8JACDlAwAA2AkAIOYDAADeCQAg6QMAABgAIOoDAAAYACDrAwAA1wEAIAsqAADFBwAwKwAAygcAMOUDAADGBwAw5gMAAMcHADDnAwAAyAcAIOgDAADJBwAw6QMAAMkHADDqAwAAyQcAMOsDAADJBwAw7AMAAMsHADDtAwAAzAcAMAsqAAC5BwAwKwAAvgcAMOUDAAC6BwAw5gMAALsHADDnAwAAvAcAIOgDAAC9BwAw6QMAAL0HADDqAwAAvQcAMOsDAAC9BwAw7AMAAL8HADDtAwAAwAcAMAsqAACtBwAwKwAAsgcAMOUDAACuBwAw5gMAAK8HADDnAwAAsAcAIOgDAACxBwAw6QMAALEHADDqAwAAsQcAMOsDAACxBwAw7AMAALMHADDtAwAAtAcAMAoGAACMBwAgEgAAjgcAIPkCBAAAAAGCAwAAAMQDAoMDQAAAAAGEA0AAAAABtgMBAAAAAbgDEAAAAAG9AwEAAAABwgNAAAAAAQIAAAAVACAqAAC4BwAgAwAAABUAICoAALgHACArAAC3BwAgASMAAN0JADAPBgAAwgUAIAwAAM0FACASAADVBQAg9gIAANMFADD3AgAAEwAQ-AIAANMFADD5AgQAAAABggMAANQFxAMigwNAAOcEACGEA0AA5wQAIbQDAQDkBAAhtgMBAOQEACG4AxAAhwUAIb0DAQAAAAHCA0AA5wQAIQIAAAAVACAjAAC3BwAgAgAAALUHACAjAAC2BwAgDPYCAAC0BwAw9wIAALUHABD4AgAAtAcAMPkCBADwBAAhggMAANQFxAMigwNAAOcEACGEA0AA5wQAIbQDAQDkBAAhtgMBAOQEACG4AxAAhwUAIb0DAQDkBAAhwgNAAOcEACEM9gIAALQHADD3AgAAtQcAEPgCAAC0BwAw-QIEAPAEACGCAwAA1AXEAyKDA0AA5wQAIYQDQADnBAAhtAMBAOQEACG2AwEA5AQAIbgDEACHBQAhvQMBAOQEACHCA0AA5wQAIQj5AgQA6gUAIYIDAAD8BsQDIoMDQADuBQAhhANAAO4FACG2AwEA6wUAIbgDEAD6BQAhvQMBAOsFACHCA0AA7gUAIQoGAAD9BgAgEgAA_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wAApwgAMOkDAACnCAAw6gMAAKcIADDrAwAApwgAMOwDAACpCAAw7QMAAKoIADALKgAAlwgAMCsAAJwIADDlAwAAmAgAMOYDAACZCAAw5wMAAJoIACDoAwAAmwgAMOkDAACbCAAw6gMAAJsIADDrAwAAmwgAMOwDAACdCAAw7QMAAJ4IADALKgAAiwgAMCsAAJAIADDlAwAAjAgAMOYDAACNCAAw5wMAAI4IACDoAwAAjwgAMOkDAACPCAAw6gMAAI8IADDrAwAAjwgAMOwDAACRCAAw7QMAAJIIADAG-QIEAAAAAYMDQAAAAAHVA0AAAAAB1gMBAAAAAdcDAgAAAAHYAyAAAAABAgAAADwAICoAAJYIACADAAAAPAAgKgAAlggAICsAAJUIACABIwAAxQkAMAsGAADCBQAg9gIAAMAFADD3AgAAOgAQ-AIAAMAFADD5AgQAAAABgwNAAOcEACG2AwQA8AQAIdUDQADnBAAh1gMBAOQEACHXAwIAwQUAIdgDIADmBAAhAgAAADwAICMAAJUIACACAAAAkwgAICMAAJQIACAK9gIAAJIIADD3AgAAkwgAEPgCAACSCAAw-QIEAPAEACGDA0AA5wQAIbYDBADwBAAh1QNAAOcEACHWAwEA5AQAIdcDAgDBBQAh2AMgAOYEACEK9gIAAJIIADD3AgAAkwgAEPgCAACSCAAw-QIEAPAEACGDA0AA5wQAIbYDBADwBAAh1QNAAOcEACHWAwEA5AQAIdcDAgDBBQAh2AMgAOYEACEG-QIEAOoFACGDA0AA7gUAIdUDQADuBQAh1gMBAOsFACHXAwIAngcAIdgDIAD0BQAhBvkCBADqBQAhgwNAAO4FACHVA0AA7gUAIdYDAQDrBQAh1wMCAJ4HACHYAyAA9AUAIQb5AgQAAAABgwNAAAAAAdUDQAAAAAHWAwEAAAAB1wMCAAAAAdgDIAAAAAEH-QIEAAAAAYMDQAAAAAGRAwAAALgDApoDAQAAAAGfAwEAAAABuAMQAAAAAbkDAQAAAAECAAAAOAAgKgAAoggAIAMAAAA4ACAqAACiCAAgKwAAoQgAIAEjAADECQAwDAYAAMIFACD2AgAAwwUAMPcCAAA2ABD4AgAAwwUAMPkCBAAAAAGDA0AA5wQAIZEDAADEBbgDIpoDAQAAAAGfAwEA8QQAIbYDAQDkBAAhuAMQAIcFACG5AwEA8QQAIQIAAAA4ACAjAAChCAAgAgAAAJ8IACAjAACgCAAgC_YCAACeCAAw9wIAAJ8IABD4AgAAnggAMPkCBADwBAAhgwNAAOcEACGRAwAAxAW4AyKaAwEA5AQAIZ8DAQDxBAAhtgMBAOQEACG4AxAAhwUAIbkDAQDxBAAhC_YCAACeCAAw9wIAAJ8IABD4AgAAnggAMPkCBADwBAAhgwNAAOcEACGRAwAAxAW4AyKaAwEA5AQAIZ8DAQDxBAAhtgMBAOQEACG4AxAAhwUAIbkDAQDxBAAhB_kCBADqBQAhgwNAAO4FACGRAwAA5Aa4AyKaAwEA6wUAIZ8DAQDsBQAhuAMQAPoFACG5AwEA7AUAIQf5AgQA6gUAIYMDQADuBQAhkQMAAOQGuAMimgMBAOsFACGfAwEA7AUAIbgDEAD6BQAhuQMBAOwFACEH-QIEAAAAAYMDQAAAAAGRAwAAALgDApoDAQAAAAGfAwEAAAABuAMQAAAAAbkDAQAAAAEH-QIEAAAAAYIDAAAAvQMCgwNAAAAAAYQDQAAAAAG4AxAAAAABugMBAAAAAbsDAQAAAAECAAAANAAgKgAArggAIAMAAAA0ACAqAACuCAAgKwAArQgAIAEjAADDCQAwDAYAAMIFACD2AgAAxQUAMPcCAAAyABD4AgAAxQUAMPkCBAAAAAGCAwAAxgW9AyKDA0AA5wQAIYQDQADnBAAhtgMBAOQEACG4AxAAhwUAIboDAQAAAAG7AwEA8QQAIQIAAAA0ACAjAACtCAAgAgAAAKsIACAjAACsCAAgC_YCAACqCAAw9wIAAKsIABD4AgAAqggAMPkCBADwBAAhggMAAMYFvQMigwNAAOcEACGEA0AA5wQAIbYDAQDkBAAhuAMQAIcFACG6AwEA5AQAIbsDAQDxBAAhC_YCAACqCAAw9wIAAKsIABD4AgAAqggAMPkCBADwBAAhggMAAMYFvQMigwNAAOcEACGEA0AA5wQAIbYDAQDkBAAhuAMQAIcFACG6AwEA5AQAIbsDAQDxBAAhB_kCBADqBQAhggMAAOwGvQMigwNAAO4FACGEA0AA7gUAIbgDEAD6BQAhugMBAOsFACG7AwEA7AUAIQf5AgQA6gUAIYIDAADsBr0DIoMDQADuBQAhhANAAO4FACG4AxAA-gUAIboDAQDrBQAhuwMBAOwFACEH-QIEAAAAAYIDAAAAvQMCgwNAAAAAAYQDQAAAAAG4AxAAAAABugMBAAAAAbsDAQAAAAEGDAAA3gYAIPkCBAAAAAGDA0AAAAABsgMBAAAAAbQDAQAAAAG1AwEAAAABAgAAACUAICoAALcIACADAAAAJQAgKgAAtwgAICsAALYIACABIwAAwgkAMAIAAAAlACAjAAC2CAAgAgAAAMEHACAjAAC1CAAgBfkCBADqBQAhgwNAAO4FACGyAwEA6wUAIbQDAQDsBQAhtQMBAOsFACEGDAAA3AYAIPkCBADqBQAhgwNAAO4FACGyAwEA6wUAIbQDAQDsBQAhtQMBAOsFACEGDAAA3gYAIPkCBAAAAAGDA0AAAAABsgMBAAAAAbQDAQAAAAG1AwEAAAABCgwAAI0HACASAACOBwAg-QIEAAAAAYIDAAAAxAMCgwNAAAAAAYQDQAAAAAG0AwEAAAABuAMQAAAAAb0DAQAAAAHCA0AAAAABAgAAABUAICoAAMAIACADAAAAFQAgKgAAwAgAICsAAL8IACABIwAAwQkAMAIAAAAVACAjAAC_CAAgAgAAALUHACAjAAC-CAAgCPkCBADqBQAhggMAAPwGxAMigwNAAO4FACGEA0AA7gUAIbQDAQDrBQAhuAMQAPoFACG9AwEA6wUAIcIDQADuBQAhCgwAAP4GACASAAD_BgAg-QIEAOoFACGCAwAA_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_YCAADgCAAw9wIAAOEIABD4AgAA4AgAMPkCBADwBAAh-wIBAOQEACGDA0AA5wQAIYQDQADnBAAhpAMBAPEEACGnAwEA8QQAIbUDAQDxBAAhtgMBAOQEACHcAwEA5AQAId4DAADdBd4DIt8DIADmBAAh4AMBAPEEACEP9gIAAOAIADD3AgAA4QgAEPgCAADgCAAw-QIEAPAEACH7AgEA5AQAIYMDQADnBAAhhANAAOcEACGkAwEA8QQAIacDAQDxBAAhtQMBAPEEACG2AwEA5AQAIdwDAQDkBAAh3gMAAN0F3gMi3wMgAOYEACHgAwEA8QQAIQv5AgQA6gUAIfsCAQDrBQAhgwNAAO4FACGEA0AA7gUAIaQDAQDsBQAhpwMBAOwFACG1AwEA7AUAIbYDAQDrBQAh3AMBAOsFACHeAwAAgAjeAyLfAyAA9AUAIRQDAACBCAAgBQAAgwgAIAcAAIQIACAIAACFCAAgDwAAhwgAIBAAAIYIACATAACICAAgFAAAiQgAIBUAAIoIACD5AgQA6gUAIfsCAQDrBQAhgwNAAO4FACGEA0AA7gUAIaQDAQDsBQAhpwMBAOwFACG1AwEA7AUAIbYDAQDrBQAh3AMBAOsFACHeAwAAgAjeAyLfAyAA9AUAIRQDAADlCAAgBQAA5ggAIAcAAOcIACAIAADoCAAgDwAA6ggAIBAAAOkIACATAADrCAAgFAAA7AgAIBUAAO0IACD5AgQAAAAB-wIBAAAAAYMDQAAAAAGEA0AAAAABpAMBAAAAAacDAQAAAAG1AwEAAAABtgMBAAAAAdwDAQAAAAHeAwAAAN4DAt8DIAAAAAEDKgAAvAkAIOUDAAC9CQAg6wMAAAEAIAQqAADZCAAw5QMAANoIADDnAwAA3AgAIOsDAADdCAAwBCoAAM0IADDlAwAAzggAMOcDAADQCAAg6wMAANEIADAEKgAAwQgAMOUDAADCCAAw5wMAAMQIACDrAwAAxQgAMAQqAAC4CAAw5QMAALkIADDnAwAAuwgAIOsDAACxBwAwBCoAAK8IADDlAwAAsAgAMOcDAACyCAAg6wMAAL0HADAEKgAAowgAMOUDAACkCAAw5wMAAKYIACDrAwAApwgAMAQqAACXCAAw5QMAAJgIADDnAwAAmggAIOsDAACbCAAwBCoAAIsIADDlAwAAjAgAMOcDAACOCAAg6wMAAI8IADADKgAAugkAIOUDAAC7CQAg6wMAAAUAIAAAAAAACyoAAJYJADArAACaCQAw5QMAAJcJADDmAwAAmAkAMOcDAACZCQAg6AMAAN0IADDpAwAA3QgAMOoDAADdCAAw6wMAAN0IADDsAwAAmwkAMO0DAADgCAAwCyoAAI0JADArAACRCQAw5QMAAI4JADDmAwAAjwkAMOcDAACQCQAg6AMAAOAHADDpAwAA4AcAMOoDAADgBwAw6wMAAOAHADDsAwAAkgkAMO0DAADjBwAwCyoAAIQJADArAACICQAw5QMAAIUJADDmAwAAhgkAMOcDAACHCQAg6AMAAMoGADDpAwAAygYAMOoDAADKBgAw6wMAAMoGADDsAwAAiQkAMO0DAADNBgAwCyoAAPgIADArAAD9CAAw5QMAAPkIADDmAwAA-ggAMOcDAAD7CAAg6AMAAPwIADDpAwAA_AgAMOoDAAD8CAAw6wMAAPwIADDsAwAA_ggAMO0DAAD_CAAwBxoAAKUGACD5AgQAAAABgwNAAAAAAYQDQAAAAAGRAwAAAKYDAqQDAQAAAAGmAxAAAAABAgAAAFQAICoAAIMJACADAAAAVAAgKgAAgwkAICsAAIIJACABIwAAuQkAMA0DAAC4BQAgGgAA8wQAIPYCAAC2BQAw9wIAAFIAEPgCAAC2BQAw-QIEAAAAAYMDQADnBAAhhANAAOcEACGRAwAAtwWmAyKkAwEA5AQAIaYDEACHBQAhpwMBAPEEACHiAwAAtQUAIAIAAABUACAjAACCCQAgAgAAAIAJACAjAACBCQAgCvYCAAD_CAAw9wIAAIAJABD4AgAA_wgAMPkCBADwBAAhgwNAAOcEACGEA0AA5wQAIZEDAAC3BaYDIqQDAQDkBAAhpgMQAIcFACGnAwEA8QQAIQr2AgAA_wgAMPcCAACACQAQ-AIAAP8IADD5AgQA8AQAIYMDQADnBAAhhANAAOcEACGRAwAAtwWmAyKkAwEA5AQAIaYDEACHBQAhpwMBAPEEACEG-QIEAOoFACGDA0AA7gUAIYQDQADuBQAhkQMAAJgGpgMipAMBAOsFACGmAxAA-gUAIQcaAACaBgAg-QIEAOoFACGDA0AA7gUAIYQDQADuBQAhkQMAAJgGpgMipAMBAOsFACGmAxAA-gUAIQcaAAClBgAg-QIEAAAAAYMDQAAAAAGEA0AAAAABkQMAAACmAwKkAwEAAAABpgMQAAAAAQkYAACwBgAg-QIEAAAAAf8CAQAAAAGCAwAAAKoDAoMDQAAAAAGEA0AAAAABqAMBAAAAAaoDQAAAAAGrA0AAAAABAgAAAEkAICoAAIwJACADAAAASQAgKgAAjAkAICsAAIsJACABIwAAuAkAMAIAAABJACAjAACLCQAgAgAAAM4GACAjAACKCQAgCPkCBADqBQAh_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_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_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_AwKDA0AAAAABhANAAAAAAbgDEAAAAAG7AwEAAAABvwMBAAAAAcADAQAAAAHBA4AAAAABAwAAABoAICoAAO4JACArAAD1CQAgFQAAABoAIAMAAKgHACALAACpBwAgDQAAqgcAIA8AAKsHACAjAAD1CQAg-QIEAOoFACGDA0AA7gUAIYQDQADuBQAhnwMBAOwFACGkAwEA6wUAIacDAQDsBQAhrAMQAPoFACGxAyAA9AUAIbQDAQDrBQAhzAMCAJ4HACHQAwEA6wUAIdEDEAD6BQAh0gMQAPoFACHTAxAA-gUAIdQDAQDsBQAhEwMAAKgHACALAACpBwAgDQAAqgcAIA8AAKsHACD5AgQA6gUAIYMDQADuBQAhhANAAO4FACGfAwEA7AUAIaQDAQDrBQAhpwMBAOwFACGsAxAA-gUAIbEDIAD0BQAhtAMBAOsFACHMAwIAngcAIdADAQDrBQAh0QMQAPoFACHSAxAA-gUAIdMDEAD6BQAh1AMBAOwFACEDAAAAAwAgKgAA8AkAICsAAPgJACAXAAAAAwAgAwAAgQgAIAQAAIIIACAFAACDCAAgBwAAhAgAIAgAAIUIACAPAACHCAAgEwAAiAgAIBQAAIkIACAVAACKCAAgIwAA-AkAIPkCBADqBQAh-wIBAOsFACGDA0AA7gUAIYQDQADuBQAhpAMBAOwFACGnAwEA7AUAIbUDAQDsBQAhtgMBAOsFACHcAwEA6wUAId4DAACACN4DIt8DIAD0BQAh4AMBAOwFACEVAwAAgQgAIAQAAIIIACAFAACDCAAgBwAAhAgAIAgAAIUIACAPAACHCAAgEwAAiAgAIBQAAIkIACAVAACKCAAg-QIEAOoFACH7AgEA6wUAIYMDQADuBQAhhANAAO4FACGkAwEA7AUAIacDAQDsBQAhtQMBAOwFACG2AwEA6wUAIdwDAQDrBQAh3gMAAIAI3gMi3wMgAPQFACHgAwEA7AUAIQsGAACMBwAgDAAAjQcAIPkCBAAAAAGCAwAAAMQDAoMDQAAAAAGEA0AAAAABtAMBAAAAAbYDAQAAAAG4AxAAAAABvQMBAAAAAcIDQAAAAAECAAAAFQAgKgAA-QkAIAMAAAATACAqAAD5CQAgKwAA_QkAIA0AAAATACAGAAD9BgAgDAAA_gYAICMAAP0JACD5AgQA6gUAIYIDAAD8BsQDIoMDQADuBQAhhANAAO4FACG0AwEA6wUAIbYDAQDrBQAhuAMQAPoFACG9AwEA6wUAIcIDQADuBQAhCwYAAP0GACAMAAD-BgAg-QIEAOoFACGCAwAA_AbEAyKDA0AA7gUAIYQDQADuBQAhtAMBAOsFACG2AwEA6wUAIbgDEAD6BQAhvQMBAOsFACHCA0AA7gUAIRUDAADlCAAgBAAA7ggAIAUAAOYIACAHAADnCAAgCAAA6AgAIA8AAOoIACAQAADpCAAgFAAA7AgAIBUAAO0IACD5AgQAAAAB-wIBAAAAAYMDQAAAAAGEA0AAAAABpAMBAAAAAacDAQAAAAG1AwEAAAABtgMBAAAAAdwDAQAAAAHeAwAAAN4DAt8DIAAAAAHgAwEAAAABAgAAAAUAICoAAP4JACADAAAAAwAgKgAA_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-QIEAAAAAfoCAQAAAAH7AgEAAAAB_AIBAAAAAf0CAQAAAAH-AgEAAAABgAMBAAAAAYIDAAAAggMCgwNAAAAAAYQDQAAAAAEMGQAA0wYAIPkCBAAAAAH_AgEAAAABgwNAAAAAAYQDQAAAAAGfAwEAAAABpAMBAAAAAawDEAAAAAGtAxAAAAABrgMQAAAAAbADAAAAsAMCsQMgAAAAAQIAAAClAwAgKgAAlAoAIAoJAACgCQAgFgAAnwkAIBgBAAAAAR0AAKIJACD5AgQAAAABgwNAAAAAAYQDQAAAAAGkAwEAAAABpwMBAAAAAeEDAQAAAAECAAAAAQAgKgAAlgoAIAMAAACoAwAgKgAAlAoAICsAAJoKACAOAAAAqAMAIBkAALkGACAjAACaCgAg-QIEAOoFACH_AgEA6wUAIYMDQADuBQAhhANAAO4FACGfAwEA7AUAIaQDAQDrBQAhrAMQAPoFACGtAxAAtgYAIa4DEAC2BgAhsAMAALcGsAMisQMgAPQFACEMGQAAuQYAIPkCBADqBQAh_wIBAOsFACGDA0AA7gUAIYQDQADuBQAhnwMBAOwFACGkAwEA6wUAIawDEAD6BQAhrQMQALYGACGuAxAAtgYAIbADAAC3BrADIrEDIAD0BQAhAwAAAAcAICoAAJYKACArAACdCgAgDAAAAAcAIAkAAPUIACAWAAD0CAAgGAEA6wUAIR0AAPcIACAjAACdCgAg-QIEAOoFACGDA0AA7gUAIYQDQADuBQAhpAMBAOsFACGnAwEA6wUAIeEDAQDsBQAhCgkAAPUIACAWAAD0CAAgGAEA6wUAIR0AAPcIACD5AgQA6gUAIYMDQADuBQAhhANAAO4FACGkAwEA6wUAIacDAQDrBQAh4QMBAOwFACEKCQAAoAkAIBYAAJ8JACAXAAChCQAgGAEAAAAB-QIEAAAAAYMDQAAAAAGEA0AAAAABpAMBAAAAAacDAQAAAAHhAwEAAAABAgAAAAEAICoAAJ4KACAG-QIEAAAAAYMDQAAAAAGaAwQAAAABnAMQAAAAAZ0DEAAAAAGeAwEAAAABAwAAAAcAICoAAJ4KACArAACjCgAgDAAAAAcAIAkAAPUIACAWAAD0CAAgFwAA9ggAIBgBAOsFACEjAACjCgAg-QIEAOoFACGDA0AA7gUAIYQDQADuBQAhpAMBAOsFACGnAwEA6wUAIeEDAQDsBQAhCgkAAPUIACAWAAD0CAAgFwAA9ggAIBgBAOsFACH5AgQA6gUAIYMDQADuBQAhhANAAO4FACGkAwEA6wUAIacDAQDrBQAh4QMBAOwFACEG-QIEAAAAAYMDQAAAAAGbAwQAAAABnAMQAAAAAZ0DEAAAAAGeAwEAAAABCAMAAKQGACD5AgQAAAABgwNAAAAAAYQDQAAAAAGRAwAAAKYDAqQDAQAAAAGmAxAAAAABpwMBAAAAAQIAAABUACAqAAClCgAgBfkCBAAAAAGDA0AAAAABngMBAAAAAZ8DAQAAAAGgA4AAAAABAgAAAOwDACAqAACnCgAgAwAAAFIAICoAAKUKACArAACrCgAgCgAAAFIAIAMAAJkGACAjAACrCgAg-QIEAOoFACGDA0AA7gUAIYQDQADuBQAhkQMAAJgGpgMipAMBAOsFACGmAxAA-gUAIacDAQDsBQAhCAMAAJkGACD5AgQA6gUAIYMDQADuBQAhhANAAO4FACGRAwAAmAamAyKkAwEA6wUAIaYDEAD6BQAhpwMBAOwFACEDAAAA7wMAICoAAKcKACArAACuCgAgBwAAAO8DACAjAACuCgAg-QIEAOoFACGDA0AA7gUAIZ4DAQDrBQAhnwMBAOwFACGgA4AAAAABBfkCBADqBQAhgwNAAO4FACGeAwEA6wUAIZ8DAQDsBQAhoAOAAAAAAQwXAADSBgAg-QIEAAAAAf8CAQAAAAGDA0AAAAABhANAAAAAAZ8DAQAAAAGkAwEAAAABrAMQAAAAAa0DEAAAAAGuAxAAAAABsAMAAACwAwKxAyAAAAABAgAAAKUDACAqAACvCgAgAwAAAKgDACAqAACvCgAgKwAAswoAIA4AAACoAwAgFwAAuAYAICMAALMKACD5AgQA6gUAIf8CAQDrBQAhgwNAAO4FACGEA0AA7gUAIZ8DAQDsBQAhpAMBAOsFACGsAxAA-gUAIa0DEAC2BgAhrgMQALYGACGwAwAAtwawAyKxAyAA9AUAIQwXAAC4BgAg-QIEAOoFACH_AgEA6wUAIYMDQADuBQAhhANAAO4FACGfAwEA7AUAIaQDAQDrBQAhrAMQAPoFACGtAxAAtgYAIa4DEAC2BgAhsAMAALcGsAMisQMgAPQFACEFCUYGCgAbFgYCF0oSHVUWCwMIAQQJAgUKAgcOAwgSBAoAEQ8xChAWBRM1DhQ5DxU9EAEGAAIBBgACBAYAAgoADQwABhIvDAYDFwEKAAsLGQcNIgkPJgoQKAUCCR0GCgAIAQkeAAEMAAYCDCcGDgACAw0pAA8qABArAAERAAUBEjAAAQYAAgEGAAIBBgACCAU-AAc_AAhAAA9CABBBABNDABREABVFAAIDAAEYABMDCgAVF0sSGU8UARgAEwIXUAAZUQADA1YBCgAaGloXAhsAGBwAFgIKABkaWxcBGlwAARpdAAQJXwAWXgAXYAAdYQAAAAAFCgAgMAAhMQAiMgAjMwAkAAAAAAAFCgAgMAAhMQAiMgAjMwAkAgOCAQEEgwECAgOJAQEEigECBQoAKTAAKjEAKzIALDMALQAAAAAABQoAKTAAKjEAKzIALDMALQEGAAIBBgACBQoAMjAAMzEANDIANTMANgAAAAAABQoAMjAAMzEANDIANTMANgEGAAIBBgACBQoAOzAAPDEAPTIAPjMAPwAAAAAABQoAOzAAPDEAPTIAPjMAPwAAAAMKAEUyAEYzAEcAAAADCgBFMgBGMwBHAAAFCgBMMABNMQBOMgBPMwBQAAAAAAAFCgBMMABNMQBOMgBPMwBQAgP5AQEL-gEHAgOAAgELgQIHBQoAVTAAVjEAVzIAWDMAWQAAAAAABQoAVTAAVjEAVzIAWDMAWQEMAAYBDAAGBQoAXjAAXzEAYDIAYTMAYgAAAAAABQoAXjAAXzEAYDIAYTMAYgEGAAIBBgACBQoAZzAAaDEAaTIAajMAawAAAAAABQoAZzAAaDEAaTIAajMAawIGAAIMAAYCBgACDAAGBQoAcDAAcTEAcjIAczMAdAAAAAAABQoAcDAAcTEAcjIAczMAdAERAAUBEQAFBQoAeTAAejEAezIAfDMAfQAAAAAABQoAeTAAejEAezIAfDMAfQEGAAIBBgACBQoAggEwAIMBMQCEATIAhQEzAIYBAAAAAAAFCgCCATAAgwExAIQBMgCFATMAhgEBBgACAQYAAgUKAIsBMACMATEAjQEyAI4BMwCPAQAAAAAABQoAiwEwAIwBMQCNATIAjgEzAI8BAgyXAwYOAAICDJ0DBg4AAgUKAJQBMACVATEAlgEyAJcBMwCYAQAAAAAABQoAlAEwAJUBMQCWATIAlwEzAJgBAAAFCgCdATAAngExAJ8BMgCgATMAoQEAAAAAAAUKAJ0BMACeATEAnwEyAKABMwChAQIDAAEYABMCAwABGAATBQoApgEwAKcBMQCoATIAqQEzAKoBAAAAAAAFCgCmATAApwExAKgBMgCpATMAqgEBA94DAQED5AMBBQoArwEwALABMQCxATIAsgEzALMBAAAAAAAFCgCvATAAsAExALEBMgCyATMAswEAAAUKALgBMAC5ATEAugEyALsBMwC8AQAAAAAABQoAuAEwALkBMQC6ATIAuwEzALwBAhsAGBwAFgIbABgcABYFCgDBATAAwgExAMMBMgDEATMAxQEAAAAAAAUKAMEBMADCATEAwwEyAMQBMwDFAQAAAAMKAMsBMgDMATMAzQEAAAADCgDLATIAzAEzAM0BARgAEwEYABMFCgDSATAA0wExANQBMgDVATMA1gEAAAAAAAUKANIBMADTATEA1AEyANUBMwDWAR4CAR9iASBkASFlASJmASRoASVqHCZrHSdtAShvHClwHixxAS1yAS5zHDR2HzV3JTZ4Ajd5Ajh6Ajl7Ajp8Ajt-AjyAARw9gQEmPoUBAj-HARxAiAEnQYsBAkKMAQJDjQEcRJABKEWRAS5GkgEDR5MBA0iUAQNJlQEDSpYBA0uYAQNMmgEcTZsBL06dAQNPnwEcUKABMFGhAQNSogEDU6MBHFSmATFVpwE3VqgBEFepARBYqgEQWasBEFqsARBbrgEQXLABHF2xATheswEQX7UBHGC2ATlhtwEQYrgBEGO5ARxkvAE6Zb0BQGa_AUFnwAFBaMMBQWnEAUFqxQFBa8cBQWzJARxtygFCbswBQW_OARxwzwFDcdABQXLRAUFz0gEcdNUBRHXWAUh22AEHd9kBB3jbAQd53AEHet0BB3vfAQd84QEcfeIBSX7kAQd_5gEcgAHnAUqBAegBB4IB6QEHgwHqARyEAe0BS4UB7gFRhgHvAQaHAfABBogB8QEGiQHyAQaKAfMBBosB9QEGjAH3ARyNAfgBUo4B_AEGjwH-ARyQAf8BU5EBggIGkgGDAgaTAYQCHJQBhwJUlQGIAlqWAYkCCZcBigIJmAGLAgmZAYwCCZoBjQIJmwGPAgmcAZECHJ0BkgJbngGUAgmfAZYCHKABlwJcoQGYAgmiAZkCCaMBmgIcpAGdAl2lAZ4CY6YBnwIEpwGgAgSoAaECBKkBogIEqgGjAgSrAaUCBKwBpwIcrQGoAmSuAaoCBK8BrAIcsAGtAmWxAa4CBLIBrwIEswGwAhy0AbMCZrUBtAJstgG1AgW3AbYCBbgBtwIFuQG4AgW6AbkCBbsBuwIFvAG9Ahy9Ab4Cbb4BwAIFvwHCAhzAAcMCbsEBxAIFwgHFAgXDAcYCHMQByQJvxQHKAnXGAcsCDMcBzAIMyAHNAgzJAc4CDMoBzwIMywHRAgzMAdMCHM0B1AJ2zgHWAgzPAdgCHNAB2QJ30QHaAgzSAdsCDNMB3AIc1AHfAnjVAeACftYB4QIO1wHiAg7YAeMCDtkB5AIO2gHlAg7bAecCDtwB6QIc3QHqAn_eAewCDt8B7gIc4AHvAoAB4QHwAg7iAfECDuMB8gIc5AH1AoEB5QH2AocB5gH3Ag_nAfgCD-gB-QIP6QH6Ag_qAfsCD-sB_QIP7AH_AhztAYADiAHuAYIDD-8BhAMc8AGFA4kB8QGGAw_yAYcDD_MBiAMc9AGLA4oB9QGMA5AB9gGNAwr3AY4DCvgBjwMK-QGQAwr6AZEDCvsBkwMK_AGVAxz9AZYDkQH-AZkDCv8BmwMcgAKcA5IBgQKeAwqCAp8DCoMCoAMchAKjA5MBhQKkA5kBhgKmAxOHAqcDE4gCqgMTiQKrAxOKAqwDE4sCrgMTjAKwAxyNArEDmgGOArMDE48CtQMckAK2A5sBkQK3AxOSArgDE5MCuQMclAK8A5wBlQK9A6IBlgK-AxKXAr8DEpgCwAMSmQLBAxKaAsIDEpsCxAMSnALGAxydAscDowGeAskDEp8CywMcoALMA6QBoQLNAxKiAs4DEqMCzwMcpALSA6UBpQLTA6sBpgLUAxanAtUDFqgC1gMWqQLXAxaqAtgDFqsC2gMWrALcAxytAt0DrAGuAuADFq8C4gMcsALjA60BsQLlAxayAuYDFrMC5wMctALqA64BtQLrA7QBtgLtAxi3Au4DGLgC8QMYuQLyAxi6AvMDGLsC9QMYvAL3Axy9AvgDtQG-AvoDGL8C_AMcwAL9A7YBwQL-AxjCAv8DGMMCgAQcxAKDBLcBxQKEBL0BxgKFBBfHAoYEF8gChwQXyQKIBBfKAokEF8sCiwQXzAKNBBzNAo4EvgHOApAEF88CkgQc0AKTBL8B0QKUBBfSApUEF9MClgQc1AKZBMAB1QKaBMYB1gKcBMcB1wKdBMcB2AKgBMcB2QKhBMcB2gKiBMcB2wKkBMcB3AKmBBzdAqcEyAHeAqkExwHfAqsEHOACrATJAeECrQTHAeICrgTHAeMCrwQc5AKyBMoB5QKzBM4B5gK0BBTnArUEFOgCtgQU6QK3BBTqArgEFOsCugQU7AK8BBztAr0EzwHuAr8EFO8CwQQc8ALCBNAB8QLDBBTyAsQEFPMCxQQc9ALIBNEB9QLJBNcB"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer: Buffer2 } = await import('buffer');
  const wasmArray = Buffer2.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import('@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs'),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import('@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs');
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime2.getPrismaClient(config);
}

// prisma/generated/prisma/internal/prismaNamespace.ts
var prismaNamespace_exports = {};
__export(prismaNamespace_exports, {
  AnyNull: () => AnyNull2,
  ApplicationScalarFieldEnum: () => ApplicationScalarFieldEnum,
  CategoryScalarFieldEnum: () => CategoryScalarFieldEnum,
  CommissionScalarFieldEnum: () => CommissionScalarFieldEnum,
  CompanyScalarFieldEnum: () => CompanyScalarFieldEnum,
  CompanySubscriptionScalarFieldEnum: () => CompanySubscriptionScalarFieldEnum,
  DbNull: () => DbNull2,
  Decimal: () => Decimal2,
  FinancialTransactionScalarFieldEnum: () => FinancialTransactionScalarFieldEnum,
  InstallmentScalarFieldEnum: () => InstallmentScalarFieldEnum,
  JournalEntryScalarFieldEnum: () => JournalEntryScalarFieldEnum,
  JsonNull: () => JsonNull2,
  JsonNullValueFilter: () => JsonNullValueFilter,
  JsonNullValueInput: () => JsonNullValueInput,
  LedgerAccountScalarFieldEnum: () => LedgerAccountScalarFieldEnum,
  LedgerTransactionScalarFieldEnum: () => LedgerTransactionScalarFieldEnum,
  ModelName: () => ModelName,
  NullTypes: () => NullTypes2,
  NullableJsonNullValueInput: () => NullableJsonNullValueInput,
  NullsOrder: () => NullsOrder,
  OnboardingIntentScalarFieldEnum: () => OnboardingIntentScalarFieldEnum,
  PasswordResetScalarFieldEnum: () => PasswordResetScalarFieldEnum,
  PaymentScalarFieldEnum: () => PaymentScalarFieldEnum,
  PrismaClientInitializationError: () => PrismaClientInitializationError2,
  PrismaClientKnownRequestError: () => PrismaClientKnownRequestError2,
  PrismaClientRustPanicError: () => PrismaClientRustPanicError2,
  PrismaClientUnknownRequestError: () => PrismaClientUnknownRequestError2,
  PrismaClientValidationError: () => PrismaClientValidationError2,
  ProductScalarFieldEnum: () => ProductScalarFieldEnum,
  ProductVariantScalarFieldEnum: () => ProductVariantScalarFieldEnum,
  QueryMode: () => QueryMode,
  ReferralScalarFieldEnum: () => ReferralScalarFieldEnum,
  SessionScalarFieldEnum: () => SessionScalarFieldEnum,
  SortOrder: () => SortOrder,
  Sql: () => Sql2,
  SubscriptionPlanScalarFieldEnum: () => SubscriptionPlanScalarFieldEnum,
  TransactionIsolationLevel: () => TransactionIsolationLevel,
  UserScalarFieldEnum: () => UserScalarFieldEnum,
  UserSessionScalarFieldEnum: () => UserSessionScalarFieldEnum,
  WebhookEventScalarFieldEnum: () => WebhookEventScalarFieldEnum,
  defineExtension: () => defineExtension,
  empty: () => empty2,
  getExtensionContext: () => getExtensionContext,
  join: () => join2,
  prismaVersion: () => prismaVersion,
  raw: () => raw2,
  sql: () => sql
});
var PrismaClientKnownRequestError2 = runtime2.PrismaClientKnownRequestError;
var PrismaClientUnknownRequestError2 = runtime2.PrismaClientUnknownRequestError;
var PrismaClientRustPanicError2 = runtime2.PrismaClientRustPanicError;
var PrismaClientInitializationError2 = runtime2.PrismaClientInitializationError;
var PrismaClientValidationError2 = runtime2.PrismaClientValidationError;
var sql = runtime2.sqltag;
var empty2 = runtime2.empty;
var join2 = runtime2.join;
var raw2 = runtime2.raw;
var Sql2 = runtime2.Sql;
var Decimal2 = runtime2.Decimal;
var getExtensionContext = runtime2.Extensions.getExtensionContext;
var prismaVersion = {
  client: "7.8.0",
  engine: "3c6e192761c0362d496ed980de936e2f3cebcd3a"
};
var NullTypes2 = {
  DbNull: runtime2.NullTypes.DbNull,
  JsonNull: runtime2.NullTypes.JsonNull,
  AnyNull: runtime2.NullTypes.AnyNull
};
var DbNull2 = runtime2.DbNull;
var JsonNull2 = runtime2.JsonNull;
var AnyNull2 = runtime2.AnyNull;
var ModelName = {
  Company: "Company",
  User: "User",
  UserSession: "UserSession",
  PasswordReset: "PasswordReset",
  Session: "Session",
  Category: "Category",
  Product: "Product",
  ProductVariant: "ProductVariant",
  Application: "Application",
  Installment: "Installment",
  Payment: "Payment",
  Commission: "Commission",
  LedgerTransaction: "LedgerTransaction",
  Referral: "Referral",
  SubscriptionPlan: "SubscriptionPlan",
  CompanySubscription: "CompanySubscription",
  LedgerAccount: "LedgerAccount",
  FinancialTransaction: "FinancialTransaction",
  JournalEntry: "JournalEntry",
  WebhookEvent: "WebhookEvent",
  OnboardingIntent: "OnboardingIntent"
};
var TransactionIsolationLevel = runtime2.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable"
});
var CompanyScalarFieldEnum = {
  id: "id",
  companyId: "companyId",
  name: "name",
  plan: "plan",
  logoUrl: "logoUrl",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var UserScalarFieldEnum = {
  id: "id",
  userId: "userId",
  email: "email",
  password: "password",
  name: "name",
  role: "role",
  forcePasswordChange: "forcePasswordChange",
  companyId: "companyId",
  referredByMarketerId: "referredByMarketerId",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  referralCode: "referralCode"
};
var UserSessionScalarFieldEnum = {
  id: "id",
  sessionId: "sessionId",
  userId: "userId",
  tokenHash: "tokenHash",
  createdAt: "createdAt",
  expiresAt: "expiresAt",
  revoked: "revoked"
};
var PasswordResetScalarFieldEnum = {
  id: "id",
  userId: "userId",
  otpHash: "otpHash",
  expiresAt: "expiresAt",
  attempts: "attempts",
  used: "used",
  createdAt: "createdAt"
};
var SessionScalarFieldEnum = {
  id: "id",
  data: "data",
  expiresAt: "expiresAt"
};
var CategoryScalarFieldEnum = {
  id: "id",
  categoryId: "categoryId",
  name: "name",
  slug: "slug",
  description: "description",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var ProductScalarFieldEnum = {
  id: "id",
  productId: "productId",
  companyId: "companyId",
  name: "name",
  slug: "slug",
  description: "description",
  minPrice: "minPrice",
  maxPrice: "maxPrice",
  stockQuantity: "stockQuantity",
  price: "price",
  commissionRate: "commissionRate",
  active: "active",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  categoryId: "categoryId"
};
var ProductVariantScalarFieldEnum = {
  id: "id",
  variantId: "variantId",
  productId: "productId",
  sku: "sku",
  size: "size",
  color: "color",
  images: "images",
  stockQuantity: "stockQuantity",
  price: "price",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var ApplicationScalarFieldEnum = {
  id: "id",
  applicationId: "applicationId",
  userId: "userId",
  status: "status",
  documentData: "documentData",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var InstallmentScalarFieldEnum = {
  id: "id",
  installmentId: "installmentId",
  userId: "userId",
  productId: "productId",
  amount: "amount",
  dueDate: "dueDate",
  status: "status",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var PaymentScalarFieldEnum = {
  id: "id",
  paymentId: "paymentId",
  installmentId: "installmentId",
  amount: "amount",
  status: "status",
  gatewayRef: "gatewayRef",
  idempotencyKey: "idempotencyKey",
  webhookPayload: "webhookPayload",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var CommissionScalarFieldEnum = {
  id: "id",
  commissionId: "commissionId",
  userId: "userId",
  paymentId: "paymentId",
  amount: "amount",
  status: "status",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var LedgerTransactionScalarFieldEnum = {
  id: "id",
  transactionId: "transactionId",
  userId: "userId",
  type: "type",
  amount: "amount",
  referenceId: "referenceId",
  description: "description",
  createdAt: "createdAt"
};
var ReferralScalarFieldEnum = {
  id: "id",
  referralId: "referralId",
  marketerId: "marketerId",
  productId: "productId",
  referralCode: "referralCode",
  createdAt: "createdAt"
};
var SubscriptionPlanScalarFieldEnum = {
  id: "id",
  planId: "planId",
  name: "name",
  description: "description",
  price: "price",
  discountPrice: "discountPrice",
  discountPercentage: "discountPercentage",
  interval: "interval",
  active: "active",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var CompanySubscriptionScalarFieldEnum = {
  id: "id",
  subscriptionId: "subscriptionId",
  companyId: "companyId",
  planId: "planId",
  status: "status",
  startDate: "startDate",
  endDate: "endDate",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var LedgerAccountScalarFieldEnum = {
  id: "id",
  name: "name",
  type: "type",
  balance: "balance",
  companyId: "companyId",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var FinancialTransactionScalarFieldEnum = {
  id: "id",
  reference: "reference",
  description: "description",
  metadata: "metadata",
  createdAt: "createdAt"
};
var JournalEntryScalarFieldEnum = {
  id: "id",
  transactionId: "transactionId",
  ledgerAccountId: "ledgerAccountId",
  debit: "debit",
  credit: "credit",
  reference: "reference",
  createdAt: "createdAt"
};
var WebhookEventScalarFieldEnum = {
  id: "id",
  source: "source",
  type: "type",
  payload: "payload",
  processed: "processed",
  createdAt: "createdAt"
};
var OnboardingIntentScalarFieldEnum = {
  id: "id",
  intentId: "intentId",
  email: "email",
  companyName: "companyName",
  adminName: "adminName",
  passwordHash: "passwordHash",
  planId: "planId",
  paymentReference: "paymentReference",
  status: "status",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var SortOrder = {
  asc: "asc",
  desc: "desc"
};
var JsonNullValueInput = {
  JsonNull: JsonNull2
};
var NullableJsonNullValueInput = {
  DbNull: DbNull2,
  JsonNull: JsonNull2
};
var QueryMode = {
  default: "default",
  insensitive: "insensitive"
};
var NullsOrder = {
  first: "first",
  last: "last"
};
var JsonNullValueFilter = {
  DbNull: DbNull2,
  JsonNull: JsonNull2,
  AnyNull: AnyNull2
};
var defineExtension = runtime2.Extensions.defineExtension;

// prisma/generated/prisma/enums.ts
var SubscriptionInterval = {
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY"
};
var AccountType = {
  ASSET: "ASSET",
  REVENUE: "REVENUE"};

// prisma/generated/prisma/client.ts
globalThis["__dirname"] = path.dirname(fileURLToPath(import.meta.url));
var PrismaClient = getPrismaClientClass();
var isProduction = process.env.NODE_ENV === "production";
var connectionString = process.env.DATABASE_URL;
var adapter = isProduction ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString });
var prisma = new PrismaClient({ adapter }).$extends({
  result: {
    product: { id: { needs: {}, compute: () => void 0 } },
    user: { id: { needs: {}, compute: () => void 0 } },
    company: { id: { needs: {}, compute: () => void 0 } },
    category: { id: { needs: {}, compute: () => void 0 } },
    productVariant: { id: { needs: {}, compute: () => void 0 } },
    application: { id: { needs: {}, compute: () => void 0 } },
    installment: { id: { needs: {}, compute: () => void 0 } },
    payment: { id: { needs: {}, compute: () => void 0 } },
    commission: { id: { needs: {}, compute: () => void 0 } },
    ledgerTransaction: { id: { needs: {}, compute: () => void 0 } },
    referral: { id: { needs: {}, compute: () => void 0 } },
    userSession: { id: { needs: {}, compute: () => void 0 } },
    subscriptionPlan: { id: { needs: {}, compute: () => void 0 } },
    companySubscription: { id: { needs: {}, compute: () => void 0 } },
    passwordReset: { id: { needs: {}, compute: () => void 0 } },
    session: { id: { needs: {}, compute: () => void 0 } },
    ledgerAccount: { id: { needs: {}, compute: () => void 0 } },
    financialTransaction: { id: { needs: {}, compute: () => void 0 } },
    journalEntry: { id: { needs: {}, compute: () => void 0 } },
    webhookEvent: { id: { needs: {}, compute: () => void 0 } },
    pendingOnboarding: { id: { needs: {}, compute: () => void 0 } }
  }
});

// src/shared/utils/prisma-session-store.ts
var PrismaSessionStore = class extends Store {
  ttl;
  constructor(ttl = 86400) {
    super();
    this.ttl = ttl;
  }
  async get(sid, callback) {
    try {
      const record = await prisma.session.findUnique({
        where: { id: sid }
      });
      if (!record || record.expiresAt < /* @__PURE__ */ new Date()) {
        return callback(null, null);
      }
      return callback(null, record.data);
    } catch (err) {
      return callback(err);
    }
  }
  async set(sid, session2, callback) {
    try {
      const expiresAt = new Date(Date.now() + this.ttl * 1e3);
      await prisma.session.upsert({
        where: { id: sid },
        update: { data: session2, expiresAt },
        create: { id: sid, data: session2, expiresAt }
      });
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }
  async destroy(sid, callback) {
    try {
      await prisma.session.delete({ where: { id: sid } });
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }
};

// src/shared/utils/sanitizer.ts
var sanitizer = (req, _res, next) => {
  next();
};
var sanitizer_default = sanitizer;
var otelLogger = logs.getLogger(process.env.SERVICE_NAME || "api");
function emit(severityText, body, attributes = {}) {
  const severityMap = {
    trace: SeverityNumber.TRACE,
    debug: SeverityNumber.DEBUG,
    info: SeverityNumber.INFO,
    warn: SeverityNumber.WARN,
    error: SeverityNumber.ERROR,
    fatal: SeverityNumber.FATAL
  };
  try {
    otelLogger.emit({
      severityNumber: severityMap[severityText],
      severityText,
      body,
      attributes: {
        environment: process.env.NODE_ENV || "development",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        ...attributes
      }
    });
  } catch (e) {
    console.error("[OTel] Failed to emit log", e);
  }
}
var logger = {
  trace: (message, meta) => {
    console.trace(`[TRACE] ${message}`, meta);
    emit("trace", message, meta);
  },
  debug: (message, meta) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[DEBUG] ${message}`, meta);
    }
    emit("debug", message, meta);
  },
  info: (message, meta) => {
    console.log(`[INFO] ${message}`, meta);
    emit("info", message, meta);
  },
  warn: (message, meta) => {
    console.warn(`[WARN] ${message}`, meta);
    emit("warn", message, meta);
  },
  error: (message, meta) => {
    console.error(`[ERROR] ${message}`, meta);
    emit("error", message, {
      ...meta,
      // Unwrap Error objects into indexable fields
      ...meta?.error instanceof Error && {
        error_message: meta.error.message,
        error_stack: meta.error.stack,
        error_name: meta.error.name
      }
    });
  },
  fatal: (message, meta) => {
    console.error(`[FATAL] ${message}`, meta);
    emit("fatal", message, {
      ...meta,
      ...meta?.error instanceof Error && {
        error_message: meta.error.message,
        error_stack: meta.error.stack,
        error_name: meta.error.name
      }
    });
  },
  // ─── Webhook Namespace ──────────────────────────────────────────────────────
  webhook: {
    received: (event, meta) => {
      console.log(`[WEBHOOK] Received: ${event}`, meta);
      emit("info", "webhook_received", {
        webhook_event: event,
        ...meta
      });
    },
    signatureFailure: (meta) => {
      console.error("[WEBHOOK] Invalid signature", meta);
      emit("error", "webhook_signature_failure", { ...meta });
    },
    duplicate: (eventId, meta) => {
      console.warn(`[WEBHOOK] Duplicate blocked: ${eventId}`, meta);
      emit("warn", "webhook_duplicate_blocked", {
        event_id: eventId,
        ...meta
      });
    },
    processed: (event, meta) => {
      console.log(`[WEBHOOK] Processed: ${event}`, meta);
      emit("info", "webhook_processed", {
        webhook_event: event,
        ...meta
      });
    },
    failed: (event, error, meta) => {
      console.error(`[WEBHOOK] Failed: ${event}`, error, meta);
      emit("error", "webhook_failed", {
        webhook_event: event,
        error_message: error?.message || String(error),
        error_stack: error?.stack,
        ...meta
      });
    },
    // ─── Paystack Namespace ───────────────────────────────────────────────────
    paystack: {
      chargeSuccess: (reference, metadataType, meta) => {
        console.log(
          `[WEBHOOK:PAYSTACK] charge.success | ref: ${reference} | type: ${metadataType}`
        );
        emit("info", "paystack_charge_success", {
          reference,
          metadata_type: metadataType,
          ...meta
        });
      },
      onboardingQueued: (intentId, reference) => {
        console.log(
          `[WEBHOOK:PAYSTACK] Onboarding queued | intentId: ${intentId}`
        );
        emit("info", "paystack_onboarding_queued", {
          intent_id: intentId,
          reference
        });
      },
      subscriptionFallback: (reference) => {
        console.log(
          `[WEBHOOK:PAYSTACK] Subscription fallback | ref: ${reference}`
        );
        emit("info", "paystack_subscription_fallback", { reference });
      }
    }
  }
};
var logger_default = logger;

// src/api/middlewares/csrf-middlewares.ts
var TOKEN_SECRET = process.env.CSRF_SECRET;
if (!TOKEN_SECRET) {
  logger_default.warn(
    "CSRF_SECRET is not set. Add it to your environment variables. Falling back to an insecure default \u2014 fix this before going to production."
  );
}
var SECRET = TOKEN_SECRET ?? "must-set-csrf-secret-in-env";
var createCsrfToken = () => crypto.randomBytes(32).toString("hex");
var hashToken = (token) => crypto.createHmac("sha256", SECRET).update(token).digest("hex");
var csrfMiddleware = (req, res, next) => {
  const path2 = req.originalUrl.split("?")[0];
  const isAuthRoute = path2.startsWith("/api/v1/auth/");
  const isWebhookRoute = path2.startsWith("/api/v1/webhooks/");
  const isBearerAuth = req.headers.authorization?.startsWith("Bearer ");
  const isCsrfEndpoint = path2 === "/api/v1/csrf-token";
  if (isAuthRoute || isBearerAuth || isCsrfEndpoint || isWebhookRoute) {
    return next();
  }
  if (req.method === "GET") {
    const rawToken = req.cookies?.["csrf_token"] || createCsrfToken();
    const hashed = hashToken(rawToken);
    if (!req.cookies?.["csrf_hash"]) {
      res.cookie("csrf_hash", hashed, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3 * 24 * 60 * 60 * 1e3
      });
    }
    if (!req.cookies?.["csrf_token"]) {
      res.cookie("csrf_token", rawToken, {
        httpOnly: false,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3 * 24 * 60 * 60 * 1e3
      });
    }
    req.csrfToken = () => rawToken;
    return next();
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const clientToken = req.headers["x-csrf-token"] || req.body?._csrf;
    const storedHash = req.cookies?.["csrf_hash"];
    if (!clientToken || !storedHash) {
      logger_default.warn(
        `CSRF Validation Failed: clientToken=${!!clientToken}, storedHash=${!!storedHash}`
      );
      return res.status(403).json({
        error: "Missing CSRF token",
        message: "A valid CSRF token is required for this operation. Perform a GET request to /api/v1/csrf-token first."
      });
    }
    const expectedHash = hashToken(clientToken);
    try {
      const valid = crypto.timingSafeEqual(
        Buffer.from(expectedHash, "hex"),
        Buffer.from(storedHash, "hex")
      );
      if (!valid) {
        return res.status(403).json({ error: "Invalid CSRF token" });
      }
    } catch {
      return res.status(403).json({ error: "Invalid CSRF token format" });
    }
  }
  return next();
};
var csrf_middlewares_default = csrfMiddleware;
dotenv.config();
function configureExpress(app2) {
  app2.use(helmet());
  app2.use(express.json());
  app2.use(express.urlencoded({ extended: true }));
  app2.use(cookieParser());
  app2.use(sanitizer_default);
  app2.set("trust proxy", 1);
  app2.use(
    session({
      store: new PrismaSessionStore(60 * 60 * 24),
      secret: process.env.SESSION_SECRET || "defaultsecret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1e3 * 60 * 60 * 24,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax"
      }
    })
  );
  app2.use(csrf_middlewares_default);
}
var options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Instalflow Platform API",
      version: "1.0.0",
      description: "API documentation for the Instalflow B2B/B2C core service engine."
    },
    servers: [
      {
        url: "http://localhost:3000/api/v1",
        description: "Development core server"
      },
      {
        url: "https://instalflow-backend-6kiz.onrender.com/api/v1",
        description: "Production server"
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter Access Token as: **Bearer <token>**"
        }
      }
    }
  },
  // Following Architecture Guide #7: Decoupled API Documentation
  apis: ["./docs/swagger/**/*.yaml"]
};
var swaggerSpec = swaggerJsdoc(options);
function setupSwagger(app2) {
  app2.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
dotenv.config();
var sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": process.env.SERVICE_NAME || "api",
    "service.environment": process.env.NODE_ENV || "development",
    "service.version": process.env.npm_package_version || "1.0.0"
  }),
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: `${process.env.POSTHOG_HOST || "https://us.i.posthog.com"}/i/v1/logs`,
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`
      }
    }),
    {
      maxExportBatchSize: 50,
      scheduledDelayMillis: 5e3,
      exportTimeoutMillis: 3e4,
      maxQueueSize: 2048
    }
  )
});
sdk.start();
async function shutdownTelemetry() {
  try {
    await sdk.shutdown();
    console.log("[OTel] SDK shut down successfully");
  } catch (e) {
    console.error("[OTel] Error shutting down SDK", e);
  }
}
process.on("SIGTERM", shutdownTelemetry);
process.on("SIGINT", shutdownTelemetry);
process.on("beforeExit", shutdownTelemetry);
var RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address"
  }),
  password: z.string().min(6, "Password must be at least 6 characters"),
  referredByMarketerId: z.uuid().optional()
});
var LoginSchema = z.object({
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address"
  }),
  password: z.string().min(1, "Password is required")
});
var ForgotPasswordSchema = z.object({
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address"
  })
});
var ResetPasswordSchema = z.object({
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address"
  }),
  token: z.string().length(6, "OTP must be 6 digits"),
  password: z.string().min(6, "Password must be at least 6 characters")
});
var ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters")
});
var CompanyRegisterSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  adminName: z.string().min(2, "Admin name is required"),
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address"
  }),
  password: z.string().min(6, "Password must be at least 6 characters"),
  planId: z.string().uuid("Invalid plan ID")
});
var MarketerCreateSchema = z.object({
  name: z.string().min(2, "Marketer name is required"),
  email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, {
    message: "Invalid email address"
  })
});
var ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;
var REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;
var SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "12", 10);
async function bcryptHash(password) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}
async function bcryptCompare(password, hash) {
  return bcrypt.compare(password, hash);
}
function generateAccessToken({
  userId,
  companyId,
  role,
  email,
  sessionId
}) {
  return jwt.sign(
    { userId, companyId, role, email, sessionId },
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: "1d"
    }
  );
}
function generateRefreshToken({
  companyId,
  userId,
  role,
  email
}) {
  return jwt.sign({ companyId, userId, role, email }, REFRESH_TOKEN_SECRET, {
    expiresIn: "7d"
  });
}
function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
}
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

// src/shared/utils/AppError.ts
var AppError = class extends Error {
  statusCode;
  errorType;
  constructor(statusCode, message, errorType) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    Error.captureStackTrace(this, this.constructor);
  }
};
var BadRequestError = class extends AppError {
  constructor(message = "Bad Request") {
    super(400, message, "Bad Request" /* BAD_REQUEST */);
  }
};
var UnauthorizedError = class extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "Authentication Error" /* UNAUTHORIZED */);
  }
};
var ForbiddenError = class extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "Authorization Error" /* FORBIDDEN */);
  }
};
var NotFoundError = class extends AppError {
  constructor(message = "Not Found") {
    super(404, message, "Not Found" /* NOT_FOUND */);
  }
};
var ConflictError = class extends AppError {
  constructor(message = "Conflict") {
    super(409, message, "Conflict Error" /* CONFLICT */);
  }
};

// src/core/events/emitter.ts
var handlers = {};
var emitEvent = async (event, payload) => {
  const localHandlers = handlers[event] ?? [];
  if (localHandlers.length > 0) {
    await Promise.allSettled(localHandlers.map((h) => h(payload)));
  }
  await forwardToHub(event, payload);
};
async function forwardToHub(event, payload) {
  const hubUrl = process.env.NOTIFICATION_HUB_URL;
  if (!hubUrl) {
    console.warn(
      "[emitter] NOTIFICATION_HUB_URL not set \u2014 skipping hub dispatch"
    );
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8e3);
  try {
    const res = await fetch(hubUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": process.env.NOTIFICATION_HUB_SECRET ?? ""
      },
      body: JSON.stringify({ event, payload }),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[emitter] Hub rejected event=${event}: ${res.status} ${text}`
      );
      return;
    }
    const result = await res.json();
    console.log(`[emitter] Hub accepted event=${event}`, result);
  } catch (err) {
    console.error(
      `[emitter] Hub dispatch failed for event=${event}:`,
      err?.message ?? err
    );
  } finally {
    clearTimeout(timeout);
  }
}

// src/core/services/auth.service.ts
var AuthService = class {
  /**
   * Register a new customer account.
   */
  static async register(data) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existing) throw new ConflictError("Email is already in use");
    if (data.referredByMarketerId) {
      const marketer = await prisma.user.findUnique({
        where: { userId: data.referredByMarketerId, role: "MARKETER" }
      });
      if (!marketer)
        throw new BadRequestError("Invalid referral: Marketer not found.");
    }
    const hashedPassword = await bcryptHash(data.password);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: "CUSTOMER",
        referredByMarketerId: data.referredByMarketerId
      },
      select: {
        userId: true,
        name: true,
        email: true,
        role: true,
        referredByMarketerId: true,
        createdAt: true
      }
    });
    const refreshToken = generateRefreshToken({
      userId: user.userId,
      role: user.role,
      email: user.email
    });
    const expiresAt = /* @__PURE__ */ new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const session2 = await prisma.userSession.create({
      data: {
        user: { connect: { userId: user.userId } },
        tokenHash: refreshToken,
        expiresAt
      }
    });
    const accessToken = generateAccessToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      sessionId: session2.sessionId
    });
    emitEvent("user.registered" /* USER_REGISTERED */, {
      email: user.email,
      name: user.name,
      dashboard_url: process.env.FRONTEND_URL
    });
    return {
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      },
      accessToken,
      refreshToken
    };
  }
  static async startOnboarding(data) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existingUser) throw new ConflictError("Admin email already in use");
    const existingCompany = await prisma.company.findFirst({
      where: { name: data.companyName }
    });
    if (existingCompany) throw new ConflictError("Company name already taken");
    const hashedPassword = await bcryptHash(data.password);
    const intent = await prisma.onboardingIntent.upsert({
      where: { email: data.email },
      update: {
        companyName: data.companyName,
        adminName: data.adminName,
        passwordHash: hashedPassword,
        planId: data.planId,
        status: "PENDING"
      },
      create: {
        email: data.email,
        companyName: data.companyName,
        adminName: data.adminName,
        passwordHash: hashedPassword,
        planId: data.planId
      }
    });
    return intent;
  }
  /**
   * For Company Admins to create Marketers.
   * Password is prefixed and forcePasswordChange is set to true.
   */
  static async createMarketer(companyId, data) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existing) throw new ConflictError("Marketer email already in use");
    const tempPassword = `IFL_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const hashedPassword = await bcryptHash(tempPassword);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: "MARKETER",
        companyId,
        forcePasswordChange: true
      },
      select: {
        userId: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        forcePasswordChange: true
      }
    });
    emitEvent("marketer.created" /* MARKETER_CREATED */, {
      email: user.email,
      name: user.name,
      tempPassword,
      dashboard_url: process.env.FRONTEND_URL
    });
    return { user, tempPassword };
  }
  /**
   * Authenticate user and issue dual tokens (Access + Refresh).
   */
  static async login(data) {
    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (!user) throw new UnauthorizedError("Invalid credentials");
    const validPassword = await bcryptCompare(data.password, user.password);
    if (!validPassword) throw new UnauthorizedError("Invalid credentials");
    const refreshToken = generateRefreshToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      companyId: user.companyId || void 0
    });
    const expiresAt = /* @__PURE__ */ new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const session2 = await prisma.userSession.create({
      data: {
        user: { connect: { userId: user.userId } },
        tokenHash: refreshToken,
        expiresAt
      }
    });
    const accessToken = generateAccessToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      sessionId: session2.sessionId,
      companyId: user.companyId || void 0
    });
    return {
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        forcePasswordChange: user.forcePasswordChange,
        createdAt: user.createdAt
      },
      accessToken,
      refreshToken
    };
  }
  /**
   * Revoke a specific session by its public sessionId.
   */
  static async revokeSession(sessionId, userId) {
    const session2 = await prisma.userSession.findUnique({
      where: { sessionId },
      include: { user: true }
    });
    if (!session2 || session2.user.userId !== userId) {
      throw new NotFoundError("Session not found");
    }
    await prisma.userSession.update({
      where: { sessionId },
      data: { revoked: true }
    });
  }
  /**
   * Logout: revoke session + clear all active sessions for the user if requested.
   */
  static async logout(sessionId, userId) {
    if (sessionId) {
      const session2 = await prisma.userSession.findUnique({
        where: { sessionId },
        include: { user: true }
      });
      if (session2 && session2.user.userId === userId) {
        await prisma.userSession.update({
          where: { sessionId },
          data: { revoked: true }
        });
      }
    } else {
      const user = await prisma.user.findUnique({ where: { userId } });
      if (user) {
        await prisma.userSession.updateMany({
          where: { user: { userId: user.userId }, revoked: false },
          data: { revoked: true }
        });
      }
    }
  }
  /**
   * Rotate Access Token using a valid, un-revoked Refresh Token.
   */
  static async refresh(refreshToken) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
    const activeSession = await prisma.userSession.findUnique({
      where: { tokenHash: refreshToken }
    });
    if (!activeSession || activeSession.revoked || activeSession.expiresAt < /* @__PURE__ */ new Date()) {
      throw new UnauthorizedError("Refresh token revoked or expired");
    }
    const user = await prisma.user.findUnique({
      where: { userId: decoded.userId }
    });
    if (!user) throw new UnauthorizedError("User no longer exists");
    const newAccessToken = generateAccessToken({
      userId: user.userId,
      role: user.role,
      email: user.email,
      sessionId: activeSession.sessionId,
      companyId: user.companyId || void 0
    });
    return { accessToken: newAccessToken };
  }
  /**
   * Forgot password: generate OTP and dispatch via notification hub.
   */
  static async forgotPassword(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        message: "If this email is registered, a password reset OTP has been sent."
      };
    }
    const now = /* @__PURE__ */ new Date();
    const recentRequests = await prisma.passwordReset.findMany({
      where: {
        user: { userId: user.userId },
        createdAt: {
          gt: new Date(now.getTime() - 15 * 60 * 1e3)
        }
      },
      orderBy: { createdAt: "desc" }
    });
    if (recentRequests.length > 0) {
      const lastRequest = recentRequests[0];
      const secondsSinceLast = (now.getTime() - lastRequest.createdAt.getTime()) / 1e3;
      if (secondsSinceLast < 60) {
        throw new ConflictError(
          `Please wait ${Math.ceil(60 - secondsSinceLast)} seconds before requesting another OTP`
        );
      }
    }
    if (recentRequests.length >= 3) {
      throw new ConflictError(
        "Too many password reset requests. Please try again later."
      );
    }
    await prisma.passwordReset.updateMany({
      where: {
        user: { userId: user.userId },
        used: false
      },
      data: { used: true }
    });
    const otp = crypto.randomInt(1e5, 999999).toString();
    const otpHash = await bcryptHash(otp);
    await prisma.passwordReset.create({
      data: {
        user: { connect: { userId: user.userId } },
        otpHash,
        attempts: 0,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1e3)
      }
    });
    emitEvent("auth.password.reset.requested" /* PASSWORD_RESET_REQUESTED */, {
      email: user.email,
      name: user.name,
      otp
    });
    return {
      message: "If this email is registered, a password reset OTP has been sent."
    };
  }
  /**
   * Reset password: validate the OTP and set a new password.
   */
  static async resetPassword(data) {
    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (!user) throw new BadRequestError("Invalid or expired reset OTP");
    const resetEntry = await prisma.passwordReset.findFirst({
      where: {
        user: { userId: user.userId },
        used: false,
        expiresAt: { gt: /* @__PURE__ */ new Date() }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!resetEntry) throw new BadRequestError("Invalid or expired reset OTP");
    const validOtp = await bcryptCompare(data.token, resetEntry.otpHash);
    if (!validOtp) {
      await prisma.passwordReset.update({
        where: { id: resetEntry.id },
        data: { attempts: { increment: 1 } }
      });
      throw new BadRequestError("Invalid or expired reset OTP");
    }
    const hashedPassword = await bcryptHash(data.password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: user.userId },
        data: {
          password: hashedPassword,
          forcePasswordChange: false
        }
      });
      await tx.passwordReset.update({
        where: { id: resetEntry.id },
        data: { used: true }
      });
      await tx.userSession.updateMany({
        where: { user: { userId: user.userId }, revoked: false },
        data: { revoked: true }
      });
    });
    emitEvent("auth.password.reset.completed" /* PASSWORD_RESET_COMPLETED */, {
      email: user.email,
      name: user.name
    });
    return { message: "Password has been reset successfully" };
  }
  /**
   * Change password: for authenticated users who know their current password.
   */
  static async changePassword(userId, data) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw new NotFoundError("User not found");
    const validCurrent = await bcryptCompare(
      data.currentPassword,
      user.password
    );
    if (!validCurrent) {
      throw new UnauthorizedError("Current password is incorrect");
    }
    const hashedPassword = await bcryptHash(data.newPassword);
    await prisma.user.update({
      where: { userId },
      data: {
        password: hashedPassword,
        forcePasswordChange: false
      }
    });
    await prisma.userSession.updateMany({
      where: { user: { userId: user.userId }, revoked: false },
      data: { revoked: true }
    });
    return { message: "Password changed successfully" };
  }
};

// src/shared/utils/ApiResponse.ts
var ApiResponse = class {
  static success(res, status = 200, message = "Success", data, pagination) {
    const serializedData = data ? JSON.parse(
      JSON.stringify(
        data,
        (_, value) => typeof value === "bigint" ? value.toString() : value
      )
    ) : null;
    const response = {
      status,
      message,
      data: serializedData
    };
    if (pagination) {
      response.pagination = pagination;
    }
    return res.status(status).json(response);
  }
  static error(res, status, message, errorType) {
    return res.status(status).json({
      status,
      message,
      error: errorType
    });
  }
  static badRequest(res, message) {
    return this.error(res, 400, message, "Bad Request");
  }
  static unauthorized(res, message) {
    return this.error(res, 401, message, "Authentication Error");
  }
  static forbidden(res, message) {
    return this.error(res, 403, message, "Authorization Error");
  }
  static notFound(res, message) {
    return this.error(res, 404, message, "Not Found");
  }
  static conflict(res, message) {
    return this.error(res, 409, message, "Conflict Error");
  }
  static validation(res, message) {
    return this.error(res, 422, message, "Validation Error");
  }
  static notAcceptable(res, message) {
    return this.error(res, 406, message, "Not Acceptable");
  }
  static internalServerError(res, message) {
    return this.error(res, 500, message, "Internal Server Error");
  }
};
var ApiResponse_default = ApiResponse;

// src/api/controllers/auth.controller.ts
var AuthController = class {
  static async register(req, res) {
    const payload = RegisterSchema.parse(req.body);
    const user = await AuthService.register(payload);
    res.cookie("refresh_token", user.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1e3
      // 7 days
    });
    return ApiResponse_default.success(
      res,
      201,
      "Customer registered successfully",
      user
    );
  }
  //  start onboarding process for company
  static async startOnboarding(req, res) {
    const payload = CompanyRegisterSchema.parse(req.body);
    const onboardingIntent = await AuthService.startOnboarding(payload);
    return ApiResponse_default.success(
      res,
      200,
      "Onboarding details validated. You may proceed to payment.",
      { onboardingIntent }
    );
  }
  /**
   * For Company/Admin users to create marketers
   */
  static async createMarketer(req, res) {
    const payload = MarketerCreateSchema.parse(req.body);
    const admin = req.user;
    if (!["COMPANY", "ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
      throw new ForbiddenError(
        "Only company administrators can create marketers"
      );
    }
    if (!admin.companyId && admin.role === "COMPANY") {
      throw new ForbiddenError(
        "Administrator must be associated with a company"
      );
    }
    const { user, tempPassword } = await AuthService.createMarketer(
      admin.companyId,
      payload
    );
    return ApiResponse_default.success(res, 201, "Marketer created successfully", {
      user,
      tempPassword,
      instructions: "Please provide the temporary password to the marketer. They will be prompted to change it upon first login."
    });
  }
  static async login(req, res) {
    const payload = LoginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await AuthService.login(payload);
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1e3
      // 7 days
    });
    return ApiResponse_default.success(res, 200, "Login successful", {
      user,
      accessToken,
      message: user.forcePasswordChange ? "CONSENT_REQUIRED: You must change your password before proceeding." : void 0
    });
  }
  static async refresh(req, res) {
    const refreshToken = req.cookies?.refresh_token || req.headers.authorization?.split(" ")[1];
    if (!refreshToken) {
      return ApiResponse_default.unauthorized(res, "Refresh token required");
    }
    const tokens = await AuthService.refresh(refreshToken);
    return ApiResponse_default.success(res, 200, "Tokens refreshed", tokens);
  }
  static async logout(req, res) {
    const sessionId = req.body.sessionId || req.user?.sessionId;
    const userId = req.user.userId;
    await AuthService.logout(sessionId, userId);
    res.clearCookie("refresh_token");
    return ApiResponse_default.success(res, 200, "Logged out successfully");
  }
  static async forgotPassword(req, res) {
    const { email } = ForgotPasswordSchema.parse(req.body);
    const result = await AuthService.forgotPassword(email);
    return ApiResponse_default.success(res, 200, result.message, result);
  }
  static async resetPassword(req, res) {
    const payload = ResetPasswordSchema.parse(req.body);
    const result = await AuthService.resetPassword(payload);
    return ApiResponse_default.success(res, 200, result.message);
  }
  static async changePassword(req, res) {
    const userId = req.user.userId;
    const payload = ChangePasswordSchema.parse(req.body);
    const result = await AuthService.changePassword(userId, payload);
    return ApiResponse_default.success(res, 200, result.message);
  }
};

// src/api/middlewares/auth.guard.ts
process.env.JWT_ACCESS_SECRET;
var requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(
        401,
        "Missing or invalid authorization header",
        "Authentication Error" /* UNAUTHORIZED */
      );
    }
    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    next(
      new AppError(
        401,
        "Token expired or invalid constraints",
        "Authentication Error" /* UNAUTHORIZED */
      )
    );
  }
};
var requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          "Forbidden: Insufficient privileges for action",
          "Authorization Error" /* FORBIDDEN */
        )
      );
    }
    next();
  };
};
var loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 15,
  message: "Too many login attempts. Please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false
});
var registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  // 5 max attempts per hour for registration
  max: 5,
  message: "Too many registration attempts. Please try again after an hour.",
  standardHeaders: true,
  legacyHeaders: false
});
var otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1e3,
  // 5 requests per 10 mins for OTP
  max: 5,
  message: "Too many OTP requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false
});
var publicApiLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false
});

// src/api/routes/auth.routes.ts
var router = Router();
router.post("/register", registerLimiter, AuthController.register);
router.post(
  "/start-onboarding",
  registerLimiter,
  AuthController.startOnboarding
);
router.post("/login", loginLimiter, AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/forgot-password", otpLimiter, AuthController.forgotPassword);
router.post("/reset-password", otpLimiter, AuthController.resetPassword);
router.post("/logout", requireAuth, AuthController.logout);
router.post("/change-password", requireAuth, AuthController.changePassword);
router.post(
  "/marketers",
  requireAuth,
  requireRole(["COMPANY", "ADMIN", "SUPER_ADMIN"]),
  AuthController.createMarketer
);
var auth_routes_default = router;

// src/core/services/ledger.service.ts
var LedgerService = class {
  /**
   * Records a balanced double-entry transaction.
   * Total Debits must equal Total Credits.
   */
  static async recordTransaction(data, txClient) {
    const totalDebits = data.entries.reduce(
      (acc, entry) => acc.plus(new prismaNamespace_exports.Decimal(entry.debit || 0)),
      new prismaNamespace_exports.Decimal(0)
    );
    const totalCredits = data.entries.reduce(
      (acc, entry) => acc.plus(new prismaNamespace_exports.Decimal(entry.credit || 0)),
      new prismaNamespace_exports.Decimal(0)
    );
    if (!totalDebits.equals(totalCredits)) {
      throw new Error(
        `Unbalanced Ledger Transaction: Debits (${totalDebits}) != Credits (${totalCredits})`
      );
    }
    const execute = async (tx) => {
      const financialTx = await tx.financialTransaction.upsert({
        where: { reference: data.reference },
        update: {
          description: data.description,
          metadata: data.metadata || {}
        },
        create: {
          reference: data.reference,
          description: data.description,
          metadata: data.metadata || {}
        }
      });
      for (const entry of data.entries) {
        let account = await tx.ledgerAccount.findFirst({
          where: {
            name: entry.accountName,
            companyId: data.companyId || null
          }
        });
        if (!account) {
          account = await tx.ledgerAccount.create({
            data: {
              name: entry.accountName,
              type: entry.accountType,
              companyId: data.companyId || null
            }
          });
        }
        const lineRef = `${data.reference}_${entry.accountName}_${Math.random().toString(36).substring(7)}`;
        await tx.journalEntry.create({
          data: {
            transactionId: financialTx.id,
            ledgerAccountId: account.id,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
            reference: lineRef
          }
        });
        const netChange = new prismaNamespace_exports.Decimal(entry.debit || 0).minus(
          new prismaNamespace_exports.Decimal(entry.credit || 0)
        );
        await tx.ledgerAccount.update({
          where: { id: account.id },
          data: { balance: { increment: netChange } }
        });
      }
      return financialTx;
    };
    return txClient ? await execute(txClient) : await prisma.$transaction(execute);
  }
};

// src/core/services/subscription.service.ts
var PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
var SubscriptionService = class {
  /**
   * Public: List available plans
   */
  static async getActivePlans() {
    return prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { price: "asc" }
    });
  }
  // for initial onboarding subscription payment
  static async initializeOnboardingPayment(intentId) {
    const intent = await prisma.onboardingIntent.findUnique({
      where: { intentId }
    });
    if (!intent) throw new NotFoundError("Onboarding intent not found");
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId: intent.planId }
    });
    if (!plan) throw new NotFoundError("Plan not found");
    const discountValue = Number(plan.discountPrice);
    const amount = discountValue > 0 ? discountValue : Number(plan.price);
    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: intent.email,
          amount: Math.round(amount * 100),
          metadata: {
            intentId: intent.intentId,
            // 🔥 KEY CHANGE
            type: "onboarding"
          }
        })
      }
    );
    const data = await response.json();
    if (!data.status) throw new BadRequestError("Paystack init failed");
    await prisma.onboardingIntent.update({
      where: { intentId },
      data: {
        paymentReference: data.data.reference,
        status: "PAYMENT_INITIALIZED"
      }
    });
    return data.data;
  }
  /**
   * Initialize a Paystack transaction for a subscription
   */
  static async initializeSubscription(companyId, planId, email) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId }
    });
    if (!plan || !plan.active) {
      throw new NotFoundError("Subscription plan not found or inactive");
    }
    const amount = plan.discountPrice ? Number(plan.discountPrice) : Number(plan.price);
    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100),
          // In kobo
          callback_url: `${process.env.FRONTEND_URL}/subscription/verify`,
          metadata: {
            companyId,
            planId,
            type: "company_subscription"
          }
        })
      }
    );
    const data = await response.json();
    if (!data.status) {
      throw new BadRequestError(
        data.message || "Paystack initialization failed"
      );
    }
    await prisma.companySubscription.create({
      data: {
        companyId,
        planId,
        status: "PENDING"
      }
    });
    return data.data;
  }
  /**
   * Internal: Verify a Paystack transaction and return data
   */
  static async validatePaystackTransaction(reference) {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
      }
    );
    const data = await response.json();
    if (!data.status || data.data.status !== "success") {
      throw new BadRequestError(
        data.message || "Payment verification failed or incomplete"
      );
    }
    return data.data;
  }
  /**
   * Verify Paystack payment and activate subscription
   */
  static async verifySubscription(reference) {
    const transaction = await this.validatePaystackTransaction(reference);
    const { companyId, planId } = transaction.metadata;
    return prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({ where: { planId } });
      if (!plan) throw new Error("Plan vanished");
      const startDate = /* @__PURE__ */ new Date();
      const endDate = /* @__PURE__ */ new Date();
      if (plan.interval === "WEEKLY") endDate.setDate(endDate.getDate() + 7);
      else if (plan.interval === "MONTHLY")
        endDate.setMonth(endDate.getMonth() + 1);
      else if (plan.interval === "YEARLY")
        endDate.setFullYear(endDate.getFullYear() + 1);
      await tx.companySubscription.updateMany({
        where: { companyId, status: "PENDING" },
        data: {
          status: "ACTIVE",
          startDate,
          endDate
        }
      });
      await tx.company.update({
        where: { companyId },
        data: { plan: plan.name }
      });
      await LedgerService.recordTransaction(
        {
          reference,
          description: `Subscription Payment: ${plan.name}`,
          companyId,
          entries: [
            {
              accountName: "PAYSTACK_CLEARING",
              accountType: AccountType.ASSET,
              debit: plan.discountPrice || plan.price
            },
            {
              accountName: "PLATFORM_REVENUE",
              accountType: AccountType.REVENUE,
              credit: plan.discountPrice || plan.price
            }
          ]
        },
        tx
      );
      return { status: "ACTIVE", plan: plan.name };
    });
  }
};
var CreateSubscriptionPlanSchema = z.object({
  name: z.string().min(2, "Plan name must be at least 2 characters"),
  description: z.string().optional(),
  price: z.number().min(0, "Price cannot be negative"),
  discountPrice: z.number().min(0).optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
  interval: z.enum(SubscriptionInterval).default(SubscriptionInterval.MONTHLY),
  active: z.boolean().default(true).optional()
});
var UpdateSubscriptionPlanSchema = CreateSubscriptionPlanSchema.partial();
var InitializeSubscriptionSchema = z.object({
  planId: z.uuid("Invalid plan ID")
});

// src/api/controllers/subscription.controller.ts
var SubscriptionController = class {
  /**
   * List available subscription plans
   */
  static async getPlans(req, res) {
    const plans = await SubscriptionService.getActivePlans();
    return ApiResponse_default.success(
      res,
      200,
      "Active subscription plans retrieved",
      plans
    );
  }
  /**
   * Initialize a subscription payment via Paystack
   */
  static async initialize(req, res) {
    const { planId } = InitializeSubscriptionSchema.parse(req.body);
    const { companyId, email } = req.user;
    if (!companyId) {
      return ApiResponse_default.forbidden(
        res,
        "Only company accounts can initialize subscriptions"
      );
    }
    const data = await SubscriptionService.initializeSubscription(
      companyId,
      planId,
      email
    );
    return ApiResponse_default.success(res, 200, "Subscription initialized", data);
  }
  /**
   * Initialize an onboarding payment for a new company intent
   */
  static async initializeOnboarding(req, res) {
    const { intentId } = req.body;
    if (!intentId) {
      return ApiResponse_default.badRequest(res, "Onboarding Intent ID is required");
    }
    try {
      const data = await SubscriptionService.initializeOnboardingPayment(intentId);
      return ApiResponse_default.success(
        res,
        200,
        "Onboarding payment initialized",
        data
      );
    } catch (error) {
      if (error.name === "NotFoundError") {
        return ApiResponse_default.notFound(res, error.message);
      }
      return ApiResponse_default.internalServerError(
        res,
        error.message || "Internal Server Error"
      );
    }
  }
  /**
   * Verify a subscription payment
   */
  static async verify(req, res) {
    const { reference } = req.query;
    if (!reference || typeof reference !== "string") {
      return ApiResponse_default.badRequest(res, "Payment reference is required");
    }
    const result = await SubscriptionService.verifySubscription(reference);
    return ApiResponse_default.success(
      res,
      200,
      "Subscription verified and activated",
      result
    );
  }
};

// src/api/routes/subscription.routes.ts
var router2 = Router();
router2.get("/plans", publicApiLimiter, SubscriptionController.getPlans);
router2.post("/initialize", publicApiLimiter, SubscriptionController.initialize);
router2.get("/verify", publicApiLimiter, SubscriptionController.verify);
router2.post(
  "/onboarding/initialize",
  publicApiLimiter,
  SubscriptionController.initializeOnboarding
);
var subscription_routes_default = router2;

// src/core/services/superadmin.service.ts
var SuperAdminService = class {
  /**
   * Create a new subscription plan
   */
  static async createSubscriptionPlan(data) {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { name: data.name }
    });
    if (existing) {
      throw new ConflictError(
        "A subscription plan with this name already exists"
      );
    }
    return prisma.subscriptionPlan.create({
      data: {
        ...data
      }
    });
  }
  /**
   * Update an existing subscription plan
   */
  static async updateSubscriptionPlan(planId, data) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId }
    });
    if (!plan) {
      throw new NotFoundError("Subscription plan not found");
    }
    return prisma.subscriptionPlan.update({
      where: { planId },
      data
    });
  }
  /**
   * List all plans (including inactive ones) - Internal Use
   */
  static async getAllSubscriptionPlans() {
    return prisma.subscriptionPlan.findMany({
      orderBy: { createdAt: "desc" }
    });
  }
  /**
   * Toggle plan status
   */
  static async togglePlanStatus(planId, active) {
    return prisma.subscriptionPlan.update({
      where: { planId },
      data: { active }
    });
  }
  /**
   * Delete a plan (only if no active subscriptions exist or archive instead)
   */
  static async deleteSubscriptionPlan(planId) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planId },
      include: { _count: { select: { subscriptions: true } } }
    });
    if (!plan) {
      throw new NotFoundError("Subscription plan not found");
    }
    if (plan._count.subscriptions > 0) {
      throw new BadRequestError(
        "Cannot delete plan with active subscriptions. Deactivate it instead."
      );
    }
    return prisma.subscriptionPlan.delete({
      where: { planId }
    });
  }
};

// src/api/controllers/superadmin.controller.ts
var SuperAdminController = class {
  /**
   * Create a new subscription plan
   */
  static async createPlan(req, res) {
    const validatedData = CreateSubscriptionPlanSchema.parse(req.body);
    const plan = await SuperAdminService.createSubscriptionPlan(validatedData);
    return ApiResponse_default.success(
      res,
      201,
      "Subscription plan created successfully",
      plan
    );
  }
  /**
   * Update an existing plan
   */
  static async updatePlan(req, res) {
    const { planId } = z.object({ planId: z.string().uuid() }).parse(req.params);
    const validatedData = UpdateSubscriptionPlanSchema.parse(req.body);
    const plan = await SuperAdminService.updateSubscriptionPlan(
      planId,
      validatedData
    );
    return ApiResponse_default.success(
      res,
      200,
      "Subscription plan updated successfully",
      plan
    );
  }
  /**
   * List all plans (Internal/SuperAdmin view)
   */
  static async getPlans(req, res) {
    const plans = await SuperAdminService.getAllSubscriptionPlans();
    return ApiResponse_default.success(
      res,
      200,
      "All subscription plans retrieved",
      plans
    );
  }
  /**
   * Toggle plan status (active/inactive)
   */
  static async toggleStatus(req, res) {
    const { planId } = z.object({ planId: z.uuid() }).parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const plan = await SuperAdminService.togglePlanStatus(planId, active);
    return ApiResponse_default.success(
      res,
      200,
      `Subscription plan ${active ? "activated" : "deactivated"} successfully`,
      plan
    );
  }
  /**
   * Delete a plan
   */
  static async deletePlan(req, res) {
    const { planId } = z.object({ planId: z.uuid() }).parse(req.params);
    await SuperAdminService.deleteSubscriptionPlan(planId);
    return ApiResponse_default.success(
      res,
      200,
      "Subscription plan deleted successfully"
    );
  }
};

// src/api/routes/superadmin.routes.ts
var router3 = Router();
router3.use(requireAuth, requireRole(["SUPER_ADMIN"]));
router3.get("/plans", SuperAdminController.getPlans);
router3.post("/plans", SuperAdminController.createPlan);
router3.patch("/plans/:planId", SuperAdminController.updatePlan);
router3.patch("/plans/:planId/toggle", SuperAdminController.toggleStatus);
router3.delete("/plans/:planId", SuperAdminController.deletePlan);
var superadmin_routes_default = router3;
var TOKEN_SECRET2 = process.env.CSRF_SECRET || "must-set-csrf-secret-in-env";
var createCsrfToken2 = () => crypto.randomBytes(32).toString("hex");
var hashToken2 = (token) => crypto.createHmac("sha256", TOKEN_SECRET2).update(token).digest("hex");
var CsrfController = class {
  /**
   * GET /api/v1/csrf-token
   * Explicitly generates and returns a CSRF token.
   */
  static async generateToken(req, res) {
    try {
      const rawToken = createCsrfToken2();
      const hashed = hashToken2(rawToken);
      res.cookie("csrf_hash", hashed, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3 * 24 * 60 * 60 * 1e3
      });
      res.cookie("csrf_token", rawToken, {
        httpOnly: false,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3 * 24 * 60 * 60 * 1e3
      });
      res.setHeader("x-csrf-token", rawToken);
      return res.status(200).json({
        status: "success",
        csrfToken: rawToken,
        message: "CSRF token generated successfully. Ensure you send it back in the 'x-csrf-token' header for state-changing requests."
      });
    } catch (error) {
      logger_default.error("Error generating CSRF token:", {
        error
      });
      return res.status(500).json({ error: "Internal Server Error during CSRF token generation" });
    }
  }
};

// src/api/routes/index.ts
var router4 = Router();
router4.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: /* @__PURE__ */ new Date() });
});
router4.get("/csrf-token", CsrfController.generateToken);
router4.use("/auth", auth_routes_default);
router4.use("/subscriptions", subscription_routes_default);
router4.use("/superadmin", superadmin_routes_default);
var routes_default = router4;
var HOST = process.env.REDIS_HOST;
var PORT = process.env.REDIS_PORT;
var USERNAME = process.env.REDIS_USERNAME;
var PASSWORD = process.env.REDIS_PASSWORD;
var redis = new Redis({
  host: HOST,
  port: PORT,
  username: USERNAME,
  password: PASSWORD,
  maxRetriesPerRequest: null
});

// src/infrastructure/redis/constant.ts
var QueueNames = {
  OnboardingQueue: "onboarding-queue"};

// src/infrastructure/queues/onboarding.queue.ts
var onboardingQueue = new Queue(QueueNames.OnboardingQueue, {
  connection: redis
});
var PAYSTACK_SECRET2 = process.env.PAYSTACK_SECRET_KEY || "";
var PaystackService = class {
  /**
   * Verify Paystack webhook signature
   */
  static verifyWebhookSignature(payload, signature) {
    try {
      const expectedSignature = crypto.createHmac("sha512", PAYSTACK_SECRET2).update(payload).digest("hex");
      return this.timingSafeCompare(expectedSignature, signature);
    } catch (error) {
      console.error("Webhook verification error:", error);
      return false;
    }
  }
  /**
   * Timing-safe comparison
   */
  static timingSafeCompare(a, b) {
    try {
      const aBuffer = Buffer.from(a);
      const bBuffer = Buffer.from(b);
      if (aBuffer.length !== bBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(aBuffer, bBuffer);
    } catch (error) {
      console.error("Timing safe compare error:", error);
      return false;
    }
  }
};

// src/api/controllers/webhook.controller.ts
process.env.PAYSTACK_SECRET_KEY || "";
var WebhookController = class _WebhookController {
  static async handlePaystack(req, res) {
    const signature = req.headers["x-paystack-signature"];
    if (!signature) {
      logger_default.webhook.signatureFailure({
        reason: "missing_signature_header"
      });
      return res.status(400).send("Missing signature");
    }
    let rawBody;
    try {
      if (Buffer.isBuffer(req.body)) {
        rawBody = req.body.toString("utf8");
      } else if (typeof req.body === "string") {
        rawBody = req.body;
      } else if (typeof req.body === "object" && req.body !== null) {
        rawBody = JSON.stringify(req.body);
      } else {
        logger_default.webhook.signatureFailure({
          reason: "unparseable_body"
        });
        return res.status(400).send("Invalid body");
      }
    } catch (error) {
      logger_default.webhook.signatureFailure({
        reason: "body_normalization_failed",
        error
      });
      return res.status(400).send("Invalid payload");
    }
    const isValid = PaystackService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger_default.webhook.signatureFailure({
        reason: "invalid_signature",
        received: signature
      });
      return res.status(400).send("Invalid signature");
    }
    let event;
    try {
      if (Buffer.isBuffer(req.body)) {
        event = JSON.parse(req.body.toString("utf8"));
      } else if (typeof req.body === "string") {
        event = JSON.parse(req.body);
      } else {
        event = req.body;
      }
    } catch (error) {
      logger_default.webhook.signatureFailure({
        reason: "json_parse_failure",
        error
      });
      return res.status(400).send("Malformed JSON");
    }
    if (!event?.event || !event?.data?.id) {
      logger_default.webhook.signatureFailure({
        reason: "invalid_event_structure",
        payload: event
      });
      return res.status(400).send("Invalid webhook structure");
    }
    logger_default.webhook.received(event.event, {
      event_id: event.data.id,
      metadata_type: event.data.metadata?.type
    });
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: {
        id: event.data.id.toString()
      }
    });
    if (existingEvent) {
      logger_default.webhook.duplicate(event.data.id.toString(), {
        event_type: event.event
      });
      return res.status(200).send("Event already processed");
    }
    await prisma.webhookEvent.create({
      data: {
        id: event.data.id.toString(),
        source: "PAYSTACK",
        type: event.event,
        payload: event
        // store full payload
      }
    });
    try {
      switch (event.event) {
        case "charge.success":
          await _WebhookController.handleChargeSuccess(event.data);
          break;
        default:
          logger_default.webhook.received(event.event, {
            ignored: true
          });
          break;
      }
      await prisma.webhookEvent.update({
        where: {
          id: event.data.id.toString()
        },
        data: {
          processed: true
        }
      });
      logger_default.webhook.processed(event.event, {
        event_id: event.data.id,
        metadata_type: event.data.metadata?.type
      });
      return res.status(200).send("Webhook Processed");
    } catch (error) {
      logger_default.webhook.failed(event.event, error, {
        event_id: event.data.id
      });
      return res.status(500).send("Internal Server Error during processing");
    }
  }
  static async handleChargeSuccess(data) {
    const reference = data.reference;
    const metadataType = data.metadata?.type;
    logger_default.webhook.paystack.chargeSuccess(reference, metadataType, {
      intent_id: data.metadata?.intentId
    });
    switch (metadataType) {
      case "onboarding": {
        const intent = await prisma.onboardingIntent.findFirst({
          where: { paymentReference: reference }
        });
        if (!intent) {
          logger_default.error("No intent found for reference", { reference });
          return;
        }
        if (intent.status === "COMPLETED") return;
        await prisma.onboardingIntent.update({
          where: { id: intent.id },
          data: { status: "PAID" }
        });
        await onboardingQueue.add(
          "process-onboarding",
          { intentId: intent.intentId, reference },
          {
            jobId: intent.intentId,
            attempts: 5,
            backoff: { type: "exponential", delay: 6e4 },
            removeOnComplete: true,
            removeOnFail: false
          }
        );
        logger_default.webhook.paystack.onboardingQueued(intent.intentId, reference);
        return;
      }
      default:
        logger_default.webhook.paystack.subscriptionFallback(reference);
        await SubscriptionService.verifySubscription(reference);
    }
  }
};

// src/api/routes/webhook.routes.ts
var webhookRoutes = Router();
webhookRoutes.post("/paystack", WebhookController.handlePaystack);
var webhook_routes_default = webhookRoutes;
function errorHandler(err, _req, res, _next) {
  logger_default.error("Unhandled error", {
    message: err?.message,
    stack: err?.stack,
    type: err?.constructor?.name
  });
  if (err instanceof ZodError) {
    return ApiResponse_default.validation(
      res,
      err.issues.map((e) => e.message).join(", ")
    );
  }
  if (err instanceof AppError) {
    switch (err.errorType) {
      case "Not Found" /* NOT_FOUND */:
        return ApiResponse_default.notFound(res, err.message);
      case "Bad Request" /* BAD_REQUEST */:
        return ApiResponse_default.badRequest(res, err.message);
      case "Conflict Error" /* CONFLICT */:
        return ApiResponse_default.conflict(res, err.message);
      case "Authentication Error" /* UNAUTHORIZED */:
        return ApiResponse_default.unauthorized(res, err.message);
      case "Authorization Error" /* FORBIDDEN */:
        return ApiResponse_default.error(res, 403, err.message, "Authorization Error");
      default:
        return ApiResponse_default.error(
          res,
          500,
          "Something went wrong",
          "Internal Server Error"
        );
    }
  }
  return ApiResponse_default.internalServerError(res, "An unexpected error occurred");
}

// src/api/index.ts
var app = express();
app.use(
  "/api/v1/webhooks",
  express.raw({ type: "application/json" }),
  webhook_routes_default
);
configureExpress(app);
setupSwagger(app);
app.use(cors());
app.use("/api/v1", routes_default);
app.use(errorHandler);
var PORT2 = process.env.PORT || 3e3;
app.listen(PORT2, () => console.log(`\u{1F680} API Server Live on port ${PORT2}`));
