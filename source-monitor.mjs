export function createSourceMonitor({pool,mailer,statuses,now=Date.now,recipient=process.env.OPERATIONS_EMAIL}){
  return async function check(){
    for(const source of statuses()){
      const failure=['stale','unavailable'].includes(source.status),stamp=new Date(now()).toISOString();
      const old=(await pool.query('SELECT * FROM source_health WHERE source_id=$1',[source.id])).rows[0];
      const since=failure?(old?.failure_since||stamp):null;
      await pool.query('INSERT INTO source_health(source_id,status,fetched_at,checked_at,failure_since) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id) DO UPDATE SET status=$2,fetched_at=$3,checked_at=$4,failure_since=$5',[source.id,source.status||'not_checked',source.fetchedAt||null,stamp,since]);
      if(!failure||now()-new Date(since).getTime()<15*60_000||!recipient||!mailer.configured)continue;
      const key=`source:${source.id}`,last=(await pool.query('SELECT last_sent_at FROM operation_alerts WHERE alert_key=$1',[key])).rows[0];
      if(last&&now()-new Date(last.last_sent_at).getTime()<3_600_000)continue;
      await mailer.send(recipient,'TryggPuls: datakälla är fördröjd',`Källan ${source.id} har status ${source.status} sedan ${new Date(since).toISOString()}. Senast hämtat: ${source.fetchedAt||'ingen lyckad hämtning'}. Kontrollera /api/sources och driftloggar.`);
      await pool.query('INSERT INTO operation_alerts(alert_key,last_sent_at) VALUES($1,$2) ON CONFLICT(alert_key) DO UPDATE SET last_sent_at=$2',[key,stamp]);
    }
  };
}
