<?php
/**
 * === Multi-Sheet Event Export (Scorecards + Summaries) ===
 *  Sheet 1: Full scorecards (per match, per pool)
 *  Sheet 2: All fighters summary (Avg/Exchange, Avg/Match, Wins, Losses, Draws)
 *  Sheet 3: Pool summaries (if applicable)
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('memory_limit', '1G');

require_once __DIR__ . '/connect.php';

foreach ([__DIR__.'/../../vendor/autoload.php', __DIR__.'/../vendor/autoload.php', __DIR__.'/vendor/autoload.php'] as $p)
    if (file_exists($p)) { require_once $p; break; }

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;

$db = connect();
$eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
if (!$eventId) die("Missing ?eventId");

// --- event name ---
$st = $db->prepare("SELECT EventName FROM Events WHERE EventId=?");
$st->execute([$eventId]);
$eventName = $st->fetchColumn() ?: "Event_$eventId";

// --- pools ---
$pools = [];
$q = $db->prepare("SELECT PoolId, CONCAT('Pool ', PoolNo) AS PoolLabel FROM Pools WHERE EventId=? ORDER BY PoolNo");
$q->execute([$eventId]);
foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $p) $pools[$p['PoolId']] = $p['PoolLabel'];

// --- get fighter-level performance aggregates ---
$sqlAgg = "
SELECT
  f.FighterId,
  f.FighterName,
  COALESCE(c.ClubAcronym,'') AS ClubAcronym,
  COUNT(DISTINCT e.ExchangeId) AS totalExchanges,
  COUNT(DISTINCT m.MatchId) AS totalMatches,
  AVG(
    (s.Contact + s.Target + s.Control + s.AfterBlow + s.OpponentSelfCall)
    - (s.DoubleHit * 5)
  ) AS avgPerExchange,
  SUM(
    (SELECT AVG((sx.Contact+sx.Target+sx.Control+sx.AfterBlow+sx.OpponentSelfCall)-(sx.DoubleHit*5))
     FROM Exchanges ex JOIN ExchangeScores sx ON sx.ExchangeId=ex.ExchangeId
     WHERE ex.MatchFighterId=mf.MatchFighterId)
  ) / COUNT(DISTINCT m.MatchId) AS avgPerMatch,
  SUM(CASE WHEN mf.WinLossDraw='Win' THEN 1 ELSE 0 END) AS Wins,
  SUM(CASE WHEN mf.WinLossDraw='Loss' THEN 1 ELSE 0 END) AS Losses,
  SUM(CASE WHEN mf.WinLossDraw='Draw' THEN 1 ELSE 0 END) AS Draws
FROM Fighters f
JOIN MatchFighters mf ON mf.FighterId=f.FighterId
JOIN Matches m ON m.MatchId=mf.MatchId
LEFT JOIN Exchanges e ON e.MatchFighterId=mf.MatchFighterId
LEFT JOIN ExchangeScores s ON s.ExchangeId=e.ExchangeId
LEFT JOIN Clubs c ON f.ClubId=c.ClubId
WHERE m.EventId=?
GROUP BY f.FighterId
ORDER BY avgPerExchange DESC, avgPerMatch DESC, Wins DESC, Losses ASC, Draws DESC
";
$agg = $db->prepare($sqlAgg);
$agg->execute([$eventId]);
$fighterStats = $agg->fetchAll(PDO::FETCH_ASSOC);

// --- build structure for main scorecards (as before) ---
$sqlScores = "
SELECT
 m.MatchId, m.MatchRingNo, pm.PoolId,
 mf.MatchFighterId, mf.FighterColor,
 f.FighterName, c.ClubAcronym,
 e.ExchangeId,
 AVG(CASE WHEN s.Contact=1 THEN 1 ELSE 0 END) AS avgContact,
 AVG(CASE WHEN s.Target=1 THEN 1 ELSE 0 END) AS avgTarget,
 AVG(CASE WHEN s.Control=1 THEN 1 ELSE 0 END) AS avgControl,
 AVG(CASE WHEN s.AfterBlow=1 THEN 1 ELSE 0 END) AS avgAB,
 AVG(CASE WHEN s.OpponentSelfCall=1 THEN 1 ELSE 0 END) AS avgCall,
 AVG(CASE WHEN s.DoubleHit=1 THEN 1 ELSE 0 END) AS avgDouble
FROM Matches m
LEFT JOIN PoolMatches pm ON pm.MatchId=m.MatchId
JOIN MatchFighters mf ON mf.MatchId=m.MatchId
JOIN Fighters f ON f.FighterId=mf.FighterId
LEFT JOIN Clubs c ON f.ClubId=c.ClubId
LEFT JOIN Exchanges e ON e.MatchFighterId=mf.MatchFighterId
LEFT JOIN ExchangeScores s ON s.ExchangeId=e.ExchangeId
WHERE m.EventId=?
GROUP BY m.MatchId, e.ExchangeId, mf.MatchFighterId
ORDER BY pm.PoolId, m.MatchId, mf.FighterColor, e.ExchangeId
";
$stmt=$db->prepare($sqlScores);
$stmt->execute([$eventId]);
$rows=$stmt->fetchAll(PDO::FETCH_ASSOC);

$data=[];
foreach($rows as $r){
    $pool=$r['PoolId'] ?: 0;
    $match=$r['MatchId'];
    $color=strtolower($r['FighterColor']);
    $fighterLabel=$r['FighterName'].($r['ClubAcronym']?" ({$r['ClubAcronym']})":"");

    $data[$pool]['label']=$pools[$pool]??'Ungrouped';
    $data[$pool]['matches'][$match]['ring']=$r['MatchRingNo'];
    $data[$pool]['matches'][$match]['fighters'][$color]=$fighterLabel;

    $ex=&$data[$pool]['matches'][$match]['exchanges'][$r['ExchangeId']][$color];
    $ex['contact']=$r['avgContact'];
    $ex['target']=$r['avgTarget'];
    $ex['control']=$r['avgControl'];
    $ex['ab']=$r['avgAB'];
    $ex['call']=$r['avgCall'];
    $ex['dbl']=$r['avgDouble'];
}

// --- build workbook ---
$spreadsheet = new Spreadsheet();

// -------------------------------------------------------------
// SHEET 1: SCORECARDS (EXISTING CODE)
// -------------------------------------------------------------
$sheet = $spreadsheet->getActiveSheet();
$sheet->setTitle(substr($eventName,0,31));
$row=1;
$sheet->setCellValue("A$row",$eventName);
$sheet->getStyle("A$row")->getFont()->setBold(true)->setSize(16);
$row+=2;

$border=['borders'=>['allBorders'=>['borderStyle'=>Border::BORDER_THIN]]];
$gray=['fill'=>['fillType'=>Fill::FILL_SOLID,'startColor'=>['rgb'=>'DDDDDD']]];

foreach($data as $pool){
    $poolStart=$row;
    $sheet->setCellValue("A$row",$pool['label']);
    $sheet->getStyle("A$row")->getFont()->setBold(true)->setSize(14);
    $row++;

    foreach($pool['matches'] as $matchId=>$m){
        $matchStart=$row;
        $sheet->setCellValue("A$row","Match #$matchId (Ring {$m['ring']})");
        $sheet->getStyle("A$row")->getFont()->setBold(true);
        $row++;

        $red=$m['fighters']['red']??'Red';
        $blue=$m['fighters']['blue']??'Blue';
        $sheet->setCellValue("A$row","$red (Red)");
        $sheet->setCellValue("I$row","$blue (Blue)");
        $sheet->getStyle("A$row:I$row")->getFont()->setBold(true);
        $row++;

        $sheet->fromArray(["Judges","Contact","Target","Control","A/B","Call","Doubles"],null,"A$row");
        $sheet->fromArray(["Judges","Contact","Target","Control","A/B","Call","Doubles"],null,"I$row");
        $sheet->getStyle("A$row:G$row")->applyFromArray($gray+$border);
        $sheet->getStyle("I$row:O$row")->applyFromArray($gray+$border);
        $sheet->getStyle("A$row:G$row")->getFont()->setBold(true);
        $sheet->getStyle("I$row:O$row")->getFont()->setBold(true);
        $row++;

        $startRow=$row;
        $exIds=array_keys($m['exchanges']??[]);
        sort($exIds,SORT_NUMERIC);
        foreach($exIds as $exId){
            $fx=$m['exchanges'][$exId];
            $r=$fx['red']??['contact'=>0,'target'=>0,'control'=>0,'ab'=>0,'call'=>0,'dbl'=>0];
            $b=$fx['blue']??['contact'=>0,'target'=>0,'control'=>0,'ab'=>0,'call'=>0,'dbl'=>0];
            $sheet->fromArray([3,$r['contact'],$r['target'],$r['control'],$r['ab'],$r['call'],$r['dbl']],null,"A$row");
            $sheet->fromArray([3,$b['contact'],$b['target'],$b['control'],$b['ab'],$b['call'],$b['dbl']],null,"I$row");
            $sheet->getStyle("A$row:G$row")->applyFromArray($border);
            $sheet->getStyle("I$row:O$row")->applyFromArray($border);
            $row++;
        }
        $endRow=$row-1;

        $sheet->setCellValue("A$row","Totals");
        $sheet->setCellValue("I$row","Totals");
        foreach(['B','C','D','E','F','G'] as $col)
            $sheet->setCellValue("{$col}{$row}","=ROUND(SUM({$col}{$startRow}:{$col}{$endRow}),2)");
        foreach(['J','K','L','M','N','O'] as $col)
            $sheet->setCellValue("{$col}{$row}","=ROUND(SUM({$col}{$startRow}:{$col}{$endRow}),2)");
        $sheet->getStyle("A$row:G$row")->applyFromArray($border);
        $sheet->getStyle("I$row:O$row")->applyFromArray($border);
        $sheet->getStyle("A$row:G$row")->getFont()->setBold(true);
        $sheet->getStyle("I$row:O$row")->getFont()->setBold(true);
        $row++;

        $sheet->setCellValue("A$row","Grand Total:");
        $sheet->setCellValue("B$row","=ROUND(SUM(B{$startRow}:F{$endRow}),2)");
        $sheet->setCellValue("I$row","Grand Total:");
        $sheet->setCellValue("J$row","=ROUND(SUM(J{$startRow}:N{$endRow}),2)");
        $sheet->getStyle("A$row:G$row")->getFont()->setBold(true);
        $sheet->getStyle("I$row:O$row")->getFont()->setBold(true);
        $row++;

        $sheet->setCellValue("A$row","Ave per exchange:");
        $sheet->setCellValue("B$row","=IFERROR(ROUND(B".($row-1)."/COUNT(A{$startRow}:A{$endRow}),5),\"\")");
        $sheet->setCellValue("I$row","Ave per exchange:");
        $sheet->setCellValue("J$row","=IFERROR(ROUND(J".($row-1)."/COUNT(I{$startRow}:I{$endRow}),5),\"\")");
        $sheet->getStyle("A$row:G$row")->getFont()->setItalic(true);
        $sheet->getStyle("I$row:O$row")->getFont()->setItalic(true);
        $row++;

        for($r=$matchStart+1;$r<$row;$r++){
            $sheet->getRowDimension($r)->setVisible(false);
            $sheet->getRowDimension($r)->setCollapsed(true);
        }
        $row++;
    }
    for($r=$poolStart+1;$r<$row;$r++){
        $sheet->getRowDimension($r)->setVisible(false);
        $sheet->getRowDimension($r)->setCollapsed(true);
    }
    $row++;
}
foreach(range('A','O') as $c) $sheet->getColumnDimension($c)->setAutoSize(true);
$sheet->setShowGridlines(false);

// -------------------------------------------------------------
// SHEET 2: EVENT SUMMARY
// -------------------------------------------------------------
$summary = $spreadsheet->createSheet();
$summary->setTitle('Event Summary');
$summary->fromArray(['Fighter','Club','Avg/Exchange','Avg/Match','Wins','Losses','Draws'],null,'A1');
$summary->getStyle('A1:G1')->getFont()->setBold(true);
$row=2;
foreach($fighterStats as $fs){
    $summary->fromArray([
        $fs['FighterName'],
        $fs['ClubAcronym'],
        round($fs['avgPerExchange'],3),
        round($fs['avgPerMatch'],3),
        $fs['Wins'],
        $fs['Losses'],
        $fs['Draws']
    ],null,"A$row");
    $row++;
}
foreach(range('A','G') as $c) $summary->getColumnDimension($c)->setAutoSize(true);
$summary->setShowGridlines(false);

// -------------------------------------------------------------
// SHEET 3: POOL SUMMARY (only if pools exist)
// -------------------------------------------------------------
if(count($pools)){
    $poolSheet=$spreadsheet->createSheet();
    $poolSheet->setTitle('Pool Summaries');
    $r=1;
    foreach($pools as $poolId=>$poolLabel){
        $poolSheet->setCellValue("A$r",$poolLabel);
        $poolSheet->getStyle("A$r")->getFont()->setBold(true)->setSize(14);
        $r++;

        $sqlP=$db->prepare(str_replace('WHERE m.EventId=?','WHERE m.EventId=? AND pm.PoolId=?',$sqlAgg));
        $sqlP->execute([$eventId,$poolId]);
        $stats=$sqlP->fetchAll(PDO::FETCH_ASSOC);
        $poolSheet->fromArray(['Fighter','Club','Avg/Exchange','Avg/Match','Wins','Losses','Draws'],null,"A$r");
        $poolSheet->getStyle("A$r:G$r")->getFont()->setBold(true);
        $r++;
        foreach($stats as $fs){
            $poolSheet->fromArray([
                $fs['FighterName'],
                $fs['ClubAcronym'],
                round($fs['avgPerExchange'],3),
                round($fs['avgPerMatch'],3),
                $fs['Wins'],$fs['Losses'],$fs['Draws']
            ],null,"A$r");
            $r++;
        }
        $r+=2;
    }
    foreach(range('A','G') as $c) $poolSheet->getColumnDimension($c)->setAutoSize(true);
    $poolSheet->setShowGridlines(false);
}

// --- OUTPUT ---
header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Content-Disposition: attachment; filename="scores_export.xlsx"');
header('Cache-Control: max-age=0');
$writer = new Xlsx($spreadsheet);
$writer->save('php://output');
exit;
?>
