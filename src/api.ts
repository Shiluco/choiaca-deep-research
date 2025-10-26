import cors from 'cors';
import express, { Request, Response } from 'express';

import { searchConferences } from './conference-research';
import { deepResearch, writeFinalAnswer, writeFinalReport } from './deep-research';

const app = express();
const port = process.env.PORT || 3051;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function for consistent logging
function log(...args: any[]) {
  console.log(...args);
}

// API endpoint to run research
app.post('/api/research', async (req: Request, res: Response) => {
  try {
    const { query, depth = 3, breadth = 3 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    log('\nStarting research...\n');

    const { learnings, visitedUrls } = await deepResearch({
      query,
      breadth,
      depth,
    });

    log(`\n\nLearnings:\n\n${learnings.join('\n')}`);
    log(
      `\n\nVisited URLs (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}`,
    );

    const answer = await writeFinalAnswer({
      prompt: query,
      learnings,
    });

    // Return the results
    return res.json({
      success: true,
      answer,
      learnings,
      visitedUrls,
    });
  } catch (error: unknown) {
    console.error('Error in research API:', error);
    return res.status(500).json({
      error: 'An error occurred during research',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// generate report API
app.post('/api/generate-report',async(req:Request,res:Response)=>{
  try{
    const {query,depth = 3,breadth=3 } = req.body;
    if(!query){
      return res.status(400).json({error:'Query is required'});
    }
    log('\n Starting research...\n')
    const {learnings,visitedUrls} = await deepResearch({
      query,
      breadth,
      depth
    });
    log(`\n\nLearnings:\n\n${learnings.join('\n')}`);
    log(
      `\n\nVisited URLs (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}`,
    );
    const report = await writeFinalReport({
      prompt:query,
      learnings,
      visitedUrls
    });

    return report

  }catch(error:unknown){
    console.error("Error in generate report API:",error)
    return res.status(500).json({
      error:'An error occurred during research',
      message:error instanceof Error? error.message: String(error),
    })
  }
})

/**
 * 学会・カンファレンス検索エンドポイント
 * GET /conferences
 */
app.get('/conferences', async (req: Request, res: Response) => {
  try {
    log('\n学会・カンファレンス検索を開始...\n');

    // 将来的にクエリパラメータをサポート
    // const { field, deadline_from, deadline_to, limit } = req.query;

    // 学会検索を実行（最低10件）
    const conferences = await searchConferences({
      minResults: 10,
      maxQueries: 5,
    });

    // レスポンスを返却
    return res.status(200).json({
      conferences,
      count: conferences.length,
    });

  } catch (error: unknown) {
    console.error('学会検索APIでエラーが発生:', error);

    return res.status(500).json({
      error: 'エラーが発生しました',
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Deep Research API running on port ${port}`);
});

export default app;
