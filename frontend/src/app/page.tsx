import React from 'react';
import './globals.css';

export default function Dashboard() {
  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="header">
        <div>
          <h1 className="title">AI 만족도조사 플랫폼</h1>
          <p className="subtitle">노인복지관 통합 데이터 대시보드</p>
        </div>
        <div className="header-actions">
          <button className="btn-outline">📅 2026년 5월</button>
          <button className="btn-primary">보고서 생성</button>
        </div>
      </header>

      {/* Top Summary Cards */}
      <div className="grid-3">
        <div className="glass-card">
          <h3>총 참여자 수</h3>
          <div className="card-content">
            <div className="stat-value">1,250<span className="stat-unit">명</span></div>
            <div className="badge">응답률 85%</div>
          </div>
        </div>
        
        <div className="glass-card">
          <h3>기관 평균 만족도</h3>
          <div className="card-content">
            <div className="stat-value">4.6<span className="stat-unit">/ 5.0</span></div>
            <div className="badge">전월대비 +0.2</div>
          </div>
        </div>

        <div className="glass-card ai-card">
          <h3><span>✨</span> AI 인사이트 요약</h3>
          <p>
            평생교육팀 '스마트폰 기초반' 만족도가 크게 상승했습니다. 반면, 지역복지과 경로식당의 '메뉴 다양성' 개선 키워드가 20% 증가했습니다.
          </p>
        </div>
      </div>

      {/* Charts Area */}
      <div className="grid-2">
        <div className="glass-card chart-container">
          <h3>부서별 만족도 추이 (최근 6개월)</h3>
          <div className="chart-bars">
            {[60, 80, 75, 90, 85, 100].map((h, i) => (
              <div key={i} className="bar-wrapper">
                <div className="bar" style={{ height: `${h}%` }}></div>
              </div>
            ))}
          </div>
          <div className="chart-labels">
            <span>1월</span><span>2월</span><span>3월</span><span>4월</span><span>5월</span><span>6월</span>
          </div>
        </div>

        <div className="glass-card chart-container">
          <h3>주요 개선 키워드 (Word Cloud)</h3>
          <div className="word-cloud">
            <span style={{ fontSize: '2.25rem', color: '#f472b6', fontWeight: 'bold' }}>에어컨 온도</span>
            <span style={{ fontSize: '1.25rem', color: '#93c5fd', opacity: 0.8 }}>마이크 소리</span>
            <span style={{ fontSize: '1.5rem', color: '#c084fc', fontWeight: 'bold' }}>교재 글씨 크기</span>
            <span style={{ fontSize: '1.125rem', color: '#6ee7b7', opacity: 0.7 }}>식단 다양성</span>
            <span style={{ fontSize: '2.5rem', color: '#fde047', fontWeight: 900 }}>프로그램 확대</span>
            <span style={{ fontSize: '0.875rem', color: '#9ca3af', opacity: 0.5 }}>주차 공간</span>
          </div>
        </div>
      </div>
    </div>
  );
}
