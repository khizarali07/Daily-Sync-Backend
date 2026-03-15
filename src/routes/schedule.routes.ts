import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

const csvRowSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM format
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM format
  category: z.string().optional(),
  description: z.string().optional(),
  daysOfWeek: z.string().optional() // Comma-separated: "MON,TUE,WED"
});

// POST /api/schedule/upload - Upload CSV and create task templates
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.userId!;
    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    // Validate and transform records
    const validatedRecords = records.map((record: any, index: number) => {
      try {
        return csvRowSchema.parse(record);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
          throw new Error(`Row ${index + 2} is invalid: ${issues}. Ensure you have columns: name, startTime, endTime.`);
        }
        throw new Error(`Invalid data at row ${index + 2}: ${error}`);
      }
    });

    // Create task templates
    const templates = await prisma.$transaction(
      validatedRecords.map((record: z.infer<typeof csvRowSchema>) =>
        prisma.taskTemplate.create({
          data: {
            userId,
            name: record.name,
            startTime: record.startTime,
            endTime: record.endTime,
            category: record.category || null,
            description: record.description || null,
            isRecurring: true,
            daysOfWeek: record.daysOfWeek
              ? record.daysOfWeek.split(',').map((d: string) => d.trim().toUpperCase())
              : []
          }
        })
      )
    );

    res.status(201).json({
      message: `Successfully created ${templates.length} task templates`,
      templates
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to process CSV' });
  }
});

// GET /api/schedule/templates - Get all task templates for the user
router.get('/templates', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const templates = await prisma.taskTemplate.findMany({
      where: { userId },
      orderBy: { startTime: 'asc' }
    });

    res.json({ templates });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/schedule/templates - Create a single task template
router.post('/templates', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const data = csvRowSchema.parse(req.body);

    const template = await prisma.taskTemplate.create({
      data: {
        userId,
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        category: data.category || null,
        description: data.description || null,
        isRecurring: true,
        daysOfWeek: data.daysOfWeek
          ? data.daysOfWeek.split(',').map(d => d.trim().toUpperCase())
          : []
      }
    });

    res.status(201).json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /api/schedule/templates/:id - Update a task template
router.put('/templates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const data = csvRowSchema.parse(req.body);

    const template = await prisma.taskTemplate.findFirst({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const updated = await prisma.taskTemplate.update({
      where: { id },
      data: {
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        category: data.category || null,
        description: data.description || null,
        daysOfWeek: data.daysOfWeek
          ? data.daysOfWeek.split(',').map(d => d.trim().toUpperCase())
          : []
      }
    });

    res.json({ template: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/schedule/templates/:id - Delete a task template
router.delete('/templates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const template = await prisma.taskTemplate.findFirst({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const [, deletedFutureInstances] = await prisma.$transaction([
      prisma.taskTemplate.delete({
        where: { id }
      }),
      prisma.taskInstance.deleteMany({
        where: {
          userId,
          templateId: id,
          date: { gt: today },
        },
      }),
    ]);

    res.json({
      message: 'Template deleted successfully',
      deletedFutureInstances: deletedFutureInstances.count,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// DELETE /api/schedule/templates - Delete all task templates for user
router.delete('/templates', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [result, deletedFutureInstances] = await prisma.$transaction([
      prisma.taskTemplate.deleteMany({
        where: { userId }
      }),
      prisma.taskInstance.deleteMany({
        where: {
          userId,
          templateId: { not: null },
          date: { gt: today },
        },
      }),
    ]);

    res.json({ 
      message: `Successfully deleted ${result.count} templates`,
      count: result.count,
      deletedFutureInstances: deletedFutureInstances.count,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete templates' });
  }
});

export default router;
