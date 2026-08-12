import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// API側のZodバリデーション（categoryId/idはuuid()必須）を満たすため、
// シードの固定ID（冪等なupsertキー）は有効なUUID形式にする。
const CATEGORY_ID = {
  accessory: '10000000-0000-4000-8000-000000000001',
  kitchen: '10000000-0000-4000-8000-000000000002',
  stationery: '10000000-0000-4000-8000-000000000003',
  food: '10000000-0000-4000-8000-000000000004',
};

async function main() {
  const ownerEmail = process.env.ADMIN_EMAIL ?? 'owner@soloshop.example.com';
  const ownerPassword = process.env.ADMIN_PASSWORD ?? 'Owner@12345';

  const ownerPasswordHash = await bcrypt.hash(ownerPassword, 12);
  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      email: ownerEmail,
      passwordHash: ownerPasswordHash,
      name: '店主',
      role: 'ADMIN',
    },
  });

  const demoPasswordHash = await bcrypt.hash('Demo@12345', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@soloshop.example.com' },
    update: {},
    create: {
      email: 'demo@soloshop.example.com',
      passwordHash: demoPasswordHash,
      name: 'デモ会員',
      role: 'USER',
      cart: { create: {} },
    },
  });

  // カテゴリ（個人店向けにフラットな1階層のみ）
  const accessory = await prisma.category.upsert({
    where: { id: CATEGORY_ID.accessory },
    update: {},
    create: { id: CATEGORY_ID.accessory, name: 'アクセサリー', sortOrder: 1 },
  });
  const kitchen = await prisma.category.upsert({
    where: { id: CATEGORY_ID.kitchen },
    update: {},
    create: { id: CATEGORY_ID.kitchen, name: 'キッチン雑貨', sortOrder: 2 },
  });
  const stationery = await prisma.category.upsert({
    where: { id: CATEGORY_ID.stationery },
    update: {},
    create: { id: CATEGORY_ID.stationery, name: '紙もの・文具', sortOrder: 3 },
  });
  const food = await prisma.category.upsert({
    where: { id: CATEGORY_ID.food },
    update: {},
    create: { id: CATEGORY_ID.food, name: '食品・ドリンク', sortOrder: 4 },
  });

  const products = [
    {
      sku: 'AC-1001',
      name: '手編みビーズピアス',
      description: '一つひとつ手作業で編み込んだ、軽くて着け心地の良いビーズピアス。',
      brand: '工房いろは',
      categoryId: accessory.id,
      price: 2400,
      originalPrice: 2800,
      stock: 12,
      images: ['https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=800'],
    },
    {
      sku: 'AC-1002',
      name: '真鍮の一輪リング',
      description: '経年変化を楽しめる真鍮素材のシンプルなリング。',
      brand: '工房いろは',
      categoryId: accessory.id,
      price: 3200,
      stock: 8,
      images: ['https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800'],
    },
    {
      sku: 'KT-2001',
      name: '手びねり陶器のマグカップ',
      description: '一つとして同じ表情のない、手びねりで仕上げたマグカップ。',
      brand: '土と窯',
      categoryId: kitchen.id,
      price: 3800,
      originalPrice: 4500,
      stock: 15,
      images: ['https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800'],
    },
    {
      sku: 'KT-2002',
      name: '木製カッティングボード（小）',
      description: '国産広葉樹を使った、パン切りやチーズボードにちょうど良いサイズ。',
      brand: '土と窯',
      categoryId: kitchen.id,
      price: 4200,
      stock: 10,
      images: ['https://images.unsplash.com/photo-1594226801341-9a3f8b6b7dcd?w=800'],
    },
    {
      sku: 'ST-3001',
      name: '活版印刷のミニレターセット',
      description: '活版印刷ならではの凹凸が美しい、便箋5枚+封筒3枚のセット。',
      brand: 'かみのいえ',
      categoryId: stationery.id,
      price: 1600,
      stock: 30,
      images: ['https://images.unsplash.com/photo-1519791883288-dc8bd696e667?w=800'],
    },
    {
      sku: 'ST-3002',
      name: '手製本のミニノート',
      description: '糸かがり製本の、開きやすい手のひらサイズノート。',
      brand: 'かみのいえ',
      categoryId: stationery.id,
      price: 1200,
      originalPrice: 1500,
      stock: 25,
      images: ['https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800'],
    },
    {
      sku: 'FD-4001',
      // 飲食料品は軽減税率8%
      taxRate: 8,
      name: '自家焙煎コーヒー豆（200g）',
      description: '週末に少量ずつ焙煎している、浅煎りのシングルオリジン。',
      brand: '焙煎所ひとつぶ',
      categoryId: food.id,
      price: 1400,
      stock: 40,
      images: ['https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=800'],
    },
    {
      sku: 'FD-4002',
      // 飲食料品は軽減税率8%
      taxRate: 8,
      name: '手作りジャム3種セット',
      description: '季節の果物で仕込む、砂糖控えめの手作りジャム3本セット。',
      brand: '焙煎所ひとつぶ',
      categoryId: food.id,
      price: 2200,
      stock: 20,
      images: ['https://images.unsplash.com/photo-1600853225238-6b8647d24a6f?w=800'],
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    });
  }

  console.log('シードデータ投入完了');
  console.log(`店主(管理者)アカウント: ${ownerEmail} / ${ownerPassword}`);
  console.log(`デモ会員アカウント: demo@soloshop.example.com / Demo@12345 (userId=${demoUser.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
