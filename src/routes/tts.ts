import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { postTTS } from '../controllers/ttsController';

const router = Router();
router.use(authenticate);
router.post('/', postTTS);

export default router;
