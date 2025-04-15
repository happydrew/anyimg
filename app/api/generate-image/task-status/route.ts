import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@lib/supabase_service';
import { deductCredits } from '@lib/credits_service';

// export const runtime = "edge";

export async function POST(request: NextRequest) {

    try {
        // 获取客户端IP
        const forwardedFor = request.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
        console.log(`request ip: ${clientIp}`);

        // 从请求体获取taskId，accessToken
        const requestData = await request.json();
        console.log(`request data: ${JSON.stringify(requestData)}`);

        const { taskId, accessToken } = requestData;

        if (!taskId) {
            return NextResponse.json(
                { error: 'Missing taskId parameter' },
                { status: 400 }
            );
        }

        // 如果生成失败，返还用户点数，返回错误信息
        // if (accessToken) {
        //     // 验证 token 并获取用户ID
        //     const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

        //     if (error || !user) {
        //         return NextResponse.json(
        //             { error: 'Invalid access token' },
        //             { status: 401 }
        //         );
        //     }

        //     console.log(`User ${user.id} logged in`);

        //     const deducted = await deductCredits(user.id, -1);
        //     if (!deducted) {
        //         console.error(`Failed to deduct credit for user ${user.id}`);
        //         // 继续返回任务信息，但记录错误
        //     }
        // }

        // return NextResponse.json({
        //     success: false,
        //     status: 'FAILED',
        //     message: 'Failed to check task status'
        // });


        // 获取Kie.ai API密钥
        const apiKey = process.env.KIE_API_KEY;
        if (!apiKey) {
            console.error('Missing KIE_API_KEY in environment variables');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // 调用Kie.ai API查询任务状态
        const apiResponse = await fetch(`https://kieai.erweima.ai/api/v1/gpt4o-image/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'redirect': "follow"
            }
        });

        console.log('Kie.ai API response:', JSON.stringify(apiResponse));

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            console.error('Kie.ai API error:', errorData);
            return NextResponse.json(
                { error: 'Failed to fetch task status', details: errorData },
                { status: apiResponse.status }
            );
        }

        // 解析响应数据
        const taskResp = await apiResponse.json();
        console.log('Task response:', JSON.stringify(taskResp));

        // 根据状态返回不同的响应
        if (taskResp.data.status === 'SUCCESS') {
            // 如果生成成功，返回图像URL
            return NextResponse.json({
                success: true,
                status: 'SUCCESS',
                generatedImage: taskResp.data.response.resultUrls[0],
                message: 'Generated successfully'
            });
        } else if (taskResp.data.status === 'GENERATING') {
            // 如果还在生成中，返回状态
            return NextResponse.json({
                success: true,
                status: 'GENERATING',
                message: 'Generating, please check later'
            });
        } else {
            // 如果生成失败，返还用户点数，返回错误信息
            if (accessToken) {
                // 验证 token 并获取用户ID
                const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

                if (error || !user) {
                    return NextResponse.json(
                        { error: 'Invalid access token' },
                        { status: 401 }
                    );
                }

                console.log(`User ${user.id} logged in`);

                const deducted = await deductCredits(user.id, -1);
                if (!deducted) {
                    console.error(`Failed to deduct credit for user ${user.id}`);
                    // 继续返回任务信息，但记录错误
                }
            }

            return NextResponse.json({
                success: false,
                status: 'FAILED',
                error: taskResp.data.errorMessage || 'Failed to generate',
                message: 'Failed to generate'
            });
        }

    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to check task status'
        }, { status: 500 });
    }
} 